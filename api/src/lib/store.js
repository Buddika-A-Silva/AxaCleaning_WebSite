'use strict';
/**
 * Tiny document store with three interchangeable back ends:
 *  - Azure Table Storage  (production; set STORAGE_CONNECTION_STRING)
 *  - local JSON file      (local development; DATA_FILE or api/.data/db.json)
 *  - in-memory            (fallback when the file system is read-only)
 * Every record is a plain JSON object with an `id`, grouped by collection name.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { clone } = require('./util');
const { isProductionEnvironment, validateProductionConfig } = require('./config');

class MemoryStore {
  constructor() { this.mode = 'memory'; this.data = {}; this.locks = new Map(); }
  _col(c) { return (this.data[c] ||= {}); }
  async list(c) { return Object.values(this._col(c)).map(clone); }
  async get(c, id) { return clone(this._col(c)[id] || null); }
  async put(c, obj) { this._col(c)[obj.id] = clone(obj); this._persist(); return obj; }
  async remove(c, id) { delete this._col(c)[id]; this._persist(); }
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

const CHUNK = 30000; // Table Storage string properties are limited to 64 KiB (32K UTF-16 chars)

class TableStore {
  constructor(connectionString, tableName) {
    const { TableClient } = require('@azure/data-tables');
    this.mode = 'azure-table';
    this.client = TableClient.fromConnectionString(connectionString, tableName);
    this.lockClient = TableClient.fromConnectionString(connectionString, `${tableName}locks`);
    this.ready = Promise.all([
      this.client.createTable().catch((e) => { if (e.statusCode !== 409) throw e; }),
      this.lockClient.createTable().catch((e) => { if (e.statusCode !== 409) throw e; }),
    ]);
  }
  static encode(c, obj) {
    const json = JSON.stringify(obj);
    const entity = { partitionKey: c, rowKey: String(obj.id), chunks: Math.max(1, Math.ceil(json.length / CHUNK)) };
    for (let i = 0; i < entity.chunks; i++) entity['data' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    return entity;
  }
  static decode(e) {
    let json = '';
    for (let i = 0; i < (e.chunks || 1); i++) json += e['data' + i] || '';
    return JSON.parse(json);
  }
  async list(c) {
    await this.ready;
    const out = [];
    const filter = `PartitionKey eq '${String(c).replace(/'/g, "''")}'`;
    for await (const e of this.client.listEntities({ queryOptions: { filter } })) out.push(TableStore.decode(e));
    return out;
  }
  async get(c, id) {
    await this.ready;
    try { return TableStore.decode(await this.client.getEntity(c, String(id))); }
    catch (e) { if (e.statusCode === 404) return null; throw e; }
  }
  async put(c, obj) {
    await this.ready;
    await this.client.upsertEntity(TableStore.encode(c, obj), 'Replace');
    return obj;
  }
  async remove(c, id) {
    await this.ready;
    try { await this.client.deleteEntity(c, String(id)); }
    catch (e) { if (e.statusCode !== 404) throw e; }
  }
  async withLocks(keys, action) {
    await this.ready;
    const acquired = [];
    const lock = async (name) => {
      const rowKey = crypto.createHash('sha256').update(name).digest('hex');
      const token = crypto.randomBytes(16).toString('hex');
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const until = Date.now() + 30000;
      while (Date.now() < until) {
        try {
          await this.lockClient.createEntity({ partitionKey: 'locks', rowKey, token, expiresAt });
          acquired.push({ rowKey, token });
          return;
        } catch (e) {
          if (e.statusCode !== 409) throw e;
        }
        let existing;
        try { existing = await this.lockClient.getEntity('locks', rowKey); }
        catch (e) { if (e.statusCode === 404) continue; throw e; }
        if (Number(existing.expiresAt) < Date.now()) {
          try {
            await this.lockClient.updateEntity(
              { partitionKey: 'locks', rowKey, token, expiresAt },
              'Replace',
              { etag: existing.etag, matchConditions: 'IfNotModified' },
            );
            acquired.push({ rowKey, token });
            return;
          } catch (e) { if (e.statusCode !== 412) throw e; }
        }
        await new Promise((resolve) => setTimeout(resolve, 75 + Math.floor(Math.random() * 75)));
      }
      const { HttpError } = require('./util');
      throw new HttpError(503, 'This booking is being updated by another request. Please retry shortly.');
    };
    try {
      for (const name of [...new Set(keys.map(String))].sort()) await lock(name);
      return await action();
    } finally {
      for (const item of acquired.reverse()) {
        try {
          const current = await this.lockClient.getEntity('locks', item.rowKey);
          if (current.token === item.token) {
            await this.lockClient.deleteEntity('locks', item.rowKey, {
              etag: current.etag,
              matchConditions: 'IfNotModified',
            });
          }
        } catch (e) { if (e.statusCode !== 404 && e.statusCode !== 412) throw e; }
      }
    }
  }
}

let instance;
function getStore() {
  validateProductionConfig();
  if (instance) return instance;
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (conn) {
    instance = new TableStore(conn, process.env.STORAGE_TABLE_NAME || 'axacleaning');
  } else {
    const file = process.env.DATA_FILE || path.join(__dirname, '..', '..', '.data', 'db.json');
    try { instance = new FileStore(file); }
    catch (e) {
      if (isProductionEnvironment()) throw new Error(`Production storage is unavailable: ${e.message}`);
      console.warn('[store] File storage unavailable, using in-memory store. Data will NOT persist. Set STORAGE_CONNECTION_STRING.', e.message);
      instance = new MemoryStore();
    }
  }
  return instance;
}
// test helper
function setStore(s) { instance = s; }

module.exports = { getStore, setStore, MemoryStore, FileStore, TableStore };
