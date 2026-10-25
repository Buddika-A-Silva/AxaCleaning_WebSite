CREATE SCHEMA IF NOT EXISTS axa_private;
REVOKE ALL ON SCHEMA axa_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS axa_private.axa_records (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

CREATE TABLE IF NOT EXISTS axa_private.axa_store_locks (
  lock_key text PRIMARY KEY,
  token text NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE axa_private.axa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE axa_private.axa_store_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE axa_private.axa_records FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE axa_private.axa_store_locks FROM PUBLIC, anon, authenticated, service_role;
