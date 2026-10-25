'use strict';

function isProductionEnvironment(env = process.env) {
  return env.NODE_ENV === 'production'
    || Boolean(env.WEBSITE_INSTANCE_ID)
    || env.AZURE_FUNCTIONS_ENVIRONMENT === 'Production';
}

function validateProductionConfig(env = process.env) {
  if (!isProductionEnvironment(env)) return;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new Error('Production requires AUTH_SECRET to contain at least 32 characters.');
  }
  if (!env.STORAGE_CONNECTION_STRING) {
    throw new Error('Production requires STORAGE_CONNECTION_STRING; non-persistent storage is not allowed.');
  }
  if (String(env.SEED_DEMO_DATA || '').toLowerCase() === 'true') {
    throw new Error('SEED_DEMO_DATA must not be enabled in production.');
  }
}

module.exports = { isProductionEnvironment, validateProductionConfig };
