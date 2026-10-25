'use strict';
/**
 * Tiny document store with Supabase RPC and local development back ends.
 *  - Supabase Edge Functions (production; set SUPABASE_URL and service-role key)
 *  - local JSON file         (local development; DATA_FILE or api/.data/db.json)
 *  - in-memory            (fallback when the file system is read-only)
 * Every record is a plain JSON object with an `id`, grouped by collection name.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { clone } = require('./util');
const { isProductionEnvironment, getSupabaseServiceRoleKey, validateProductionConfig } = require('./config');

class MemoryStore {
  constructor() { this.mode = 'memory'; this.data = {}; this.locks = new Map(); }
  _col(c) { return (this.data[c] ||= {}); }
  async list(c) { return Object.values(this._col(c)).map(clone); }
  async get(c, id) { return clone(this._col(c)[id] || null); }
  async put(c, obj) { this._col(c)[obj.id] = clone(obj); this._persist(); return obj; }
  async remove(c, id) {
    delete this._col(c)[id];
    if (c === 'users') delete this._col('auth_otps')[String(id)];
    this._persist();
  }
  async setAuthOtp(userId, otp) { this._col('auth_otps')[String(userId)] = clone(otp); this._persist(); }
  async getAuthOtp(userId) {
    const otp = this._col('auth_otps')[String(userId)];
    if (!otp) return null;
    if (Date.parse(otp.expiresAt) <= Date.now() || otp.attemptsRemaining <= 0) {
      delete this._col('auth_otps')[String(userId)];
      this._persist();
      return null;
    }
    return clone(otp);
  }
  async failAuthOtp(userId) {
    const key = String(userId);
    const otp = this._col('auth_otps')[key];
    if (!otp) return 0;
    otp.attemptsRemaining -= 1;
    if (otp.attemptsRemaining <= 0 || Date.parse(otp.expiresAt) <= Date.now()) {
      delete this._col('auth_otps')[key];
      this._persist();
      return 0;
    }
    this._col('auth_otps')[key] = otp;
    this._persist();
    return otp.attemptsRemaining;
  }
  async consumeAuthOtp(userId, expectedHash) {
    const key = String(userId);
    const otp = await this.getAuthOtp(key);
    if (!otp || otp.hash !== expectedHash) return false;
    delete this._col('auth_otps')[key];
    this._persist();
    return true;
  }
  async deleteAuthOtp(userId) { delete this._col('auth_otps')[String(userId)]; this._persist(); }
  async withLocks(keys, action) {
    const ordered = [...new Set(keys.map(String))].sort();
    const acquire = async (index) => {
      if (index === ordered.length) return action();
      const key = ordered[index];
      const previous = this.locks.get(key) || Promise.resolve();
      let release;
      const current = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => current);
      this.locks.set(key, tail);
      await previous;
      try { return await acquire(index + 1); }
      finally {
        release();
        if (this.locks.get(key) === tail) this.locks.delete(key);
      }
    };
    return acquire(0);
  }
  _persist() {}
}

class FileStore extends MemoryStore {
  constructor(file) {
    super();
    this.mode = 'file';
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
    else this._persist();
  }
  _persist() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
}

class SupabaseRpcStore {
  constructor(url, serviceRoleKey, fetchImpl = fetch) {
    this.mode = 'supabase-edge';
    this.url = url.replace(/\/+$/, '');
    this.serviceRoleKey = serviceRoleKey;
    this.fetch = fetchImpl;
  }
  async _rpc(name, args) {
    const response = await this.fetch(`${this.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Supabase RPC ${name} failed (${response.status}): ${detail}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
  async list(collection) {
    const rows = await this._rpc('axa_records_list', { p_collection: String(collection) });
    if (!Array.isArray(rows)) throw new Error('Supabase RPC axa_records_list returned an invalid response.');
    return rows.map(clone);
  }
  async get(collection, id) {
    return clone(await this._rpc('axa_records_get', { p_collection: String(collection), p_id: String(id) }));
  }
  async put(collection, obj) {
    await this._rpc('axa_records_put', {
      p_collection: String(collection),
      p_id: String(obj.id),
      p_data: obj,
    });
    return obj;
  }
  async remove(collection, id) {
    await this._rpc('axa_records_remove', { p_collection: String(collection), p_id: String(id) });
  }
  async setAuthOtp(userId, otp) {
    await this._rpc('axa_auth_otp_set', {
      p_user_id: String(userId),
      p_salt: otp.salt,
      p_hash: otp.hash,
      p_expires_at: otp.expiresAt,
    });
  }
  async getAuthOtp(userId) {
    return this._rpc('axa_auth_otp_get', { p_user_id: String(userId) });
  }
  async failAuthOtp(userId) {
    return this._rpc('axa_auth_otp_fail', { p_user_id: String(userId) });
  }
  async consumeAuthOtp(userId, expectedHash) {
    return this._rpc('axa_auth_otp_consume', {
      p_user_id: String(userId),
      p_expected_hash: expectedHash,
    });
  }
  async deleteAuthOtp(userId) {
    await this._rpc('axa_auth_otp_delete', { p_user_id: String(userId) });
  }
  async withLocks(keys, action) {
    const acquired = [];
    const acquire = async (name) => {
      const lockKey = crypto.createHash('sha256').update(name).digest('hex');
      const token = crypto.randomBytes(16).toString('hex');
      const until = Date.now() + 30000;
      while (Date.now() < until) {
        if (await this._rpc('axa_store_lock_acquire', { p_lock_key: lockKey, p_token: token })) {
          acquired.push({ lockKey, token });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 75 + Math.floor(Math.random() * 75)));
      }
      const { HttpError } = require('./util');
      throw new HttpError(503, 'This booking is being updated by another request. Please retry shortly.');
    };
    try {
      for (const name of [...new Set(keys.map(String))].sort()) await acquire(name);
      return await action();
    } finally {
      for (const item of acquired.reverse()) {
        await this._rpc('axa_store_lock_release', {
          p_lock_key: item.lockKey,
          p_token: item.token,
        });
      }
    }
  }
}

let instance;
function getStore() {
  validateProductionConfig();
  if (instance) return instance;
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (process.env.SUPABASE_URL && serviceRoleKey) {
    instance = new SupabaseRpcStore(process.env.SUPABASE_URL, serviceRoleKey);
  } else {
    const file = process.env.DATA_FILE || path.join(__dirname, '..', '..', '.data', 'db.json');
    try { instance = new FileStore(file); }
    catch (e) {
      if (isProductionEnvironment()) throw new Error(`Production storage is unavailable: ${e.message}`);
      console.warn('[store] File storage unavailable, using in-memory store. Data will NOT persist. Configure Supabase Edge Function secrets.', e.message);
      instance = new MemoryStore();
    }
  }
  return instance;
}
// test helper
function setStore(s) { instance = s; }

module.exports = { getStore, setStore, MemoryStore, FileStore, SupabaseRpcStore };
