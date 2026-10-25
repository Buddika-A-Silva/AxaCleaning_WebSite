CREATE OR REPLACE FUNCTION public.axa_records_list(p_collection text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
  SELECT COALESCE(jsonb_agg(data ORDER BY id), '[]'::jsonb)
  FROM axa_private.axa_records
  WHERE collection = p_collection;
$function$;

CREATE OR REPLACE FUNCTION public.axa_records_get(p_collection text, p_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
  SELECT data
  FROM axa_private.axa_records
  WHERE collection = p_collection AND id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.axa_records_put(p_collection text, p_id text, p_data jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
  INSERT INTO axa_private.axa_records (collection, id, data)
  VALUES (p_collection, p_id, p_data)
  ON CONFLICT (collection, id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  RETURNING data;
$function$;

CREATE OR REPLACE FUNCTION public.axa_records_remove(p_collection text, p_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
  WITH removed AS (
    DELETE FROM axa_private.axa_records
    WHERE collection = p_collection AND id = p_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM removed);
$function$;

CREATE OR REPLACE FUNCTION public.axa_store_lock_acquire(p_lock_key text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
DECLARE
  acquired boolean;
BEGIN
  INSERT INTO axa_private.axa_store_locks (lock_key, token, expires_at)
  VALUES (p_lock_key, p_token, now() + interval '5 minutes')
  ON CONFLICT (lock_key)
  DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
  WHERE axa_private.axa_store_locks.expires_at < now()
  RETURNING true INTO acquired;
  RETURN COALESCE(acquired, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.axa_store_lock_release(p_lock_key text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
BEGIN
  DELETE FROM axa_private.axa_store_locks
  WHERE lock_key = p_lock_key AND token = p_token;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.axa_records_list(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_records_get(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_records_put(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_records_remove(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_store_lock_acquire(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_store_lock_release(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.axa_records_list(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_records_get(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_records_put(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_records_remove(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_store_lock_acquire(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_store_lock_release(text, text) TO service_role;
