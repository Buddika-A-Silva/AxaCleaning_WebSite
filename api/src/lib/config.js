'use strict';

function isProductionEnvironment(env = process.env) {
  return env.NODE_ENV === 'production'
    || Boolean(env.SUPABASE_URL);
}

function getSupabaseServiceRoleKey(env = process.env) {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_SECRET_KEYS) return '';
  let keys;
  try { keys = JSON.parse(env.SUPABASE_SECRET_KEYS); }
  catch { throw new Error('SUPABASE_SECRET_KEYS must contain a valid Supabase secret-key JSON object.'); }
  if (!keys || typeof keys.default !== 'string') {
    throw new Error('SUPABASE_SECRET_KEYS must contain a "default" secret key.');
  }
  return keys.default;
}

function validateProductionConfig(env = process.env) {
  if (!isProductionEnvironment(env)) return;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new Error('Production requires AUTH_SECRET to contain at least 32 characters.');
  }
  const supabaseServiceKey = getSupabaseServiceRoleKey(env);
  if (Boolean(env.SUPABASE_URL) !== Boolean(supabaseServiceKey)) {
    throw new Error('Production Edge Functions require SUPABASE_URL and a service-role secret key.');
  }
  if (!env.SUPABASE_URL) {
    throw new Error('Production requires SUPABASE_URL and a service-role secret key; non-persistent storage is not allowed.');
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.SUPABASE_URL)) {
    throw new Error('SUPABASE_URL must be an HTTPS Supabase project URL.');
  }
  if (String(env.SEED_DEMO_DATA || '').toLowerCase() === 'true') {
    throw new Error('SEED_DEMO_DATA must not be enabled in production.');
  }
}

module.exports = { isProductionEnvironment, getSupabaseServiceRoleKey, validateProductionConfig };
