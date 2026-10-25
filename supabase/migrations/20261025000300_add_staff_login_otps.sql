CREATE TABLE IF NOT EXISTS axa_private.axa_auth_otps (
  user_id text PRIMARY KEY,
  otp_salt text NOT NULL CHECK (otp_salt ~ '^[0-9a-f]{32}$'),
  otp_hash text NOT NULL CHECK (otp_hash ~ '^[0-9a-f]{128}$'),
  expires_at timestamptz NOT NULL,
  attempts_remaining smallint NOT NULL DEFAULT 5 CHECK (attempts_remaining BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE axa_private.axa_auth_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE axa_private.axa_auth_otps FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.axa_auth_otp_set(
  p_user_id text,
  p_salt text,
  p_hash text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
BEGIN
  IF p_user_id = '' OR p_expires_at <= now() OR p_expires_at > now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'Invalid staff OTP parameters';
  END IF;
  INSERT INTO axa_private.axa_auth_otps
    (user_id, otp_salt, otp_hash, expires_at, attempts_remaining, created_at)
  VALUES (p_user_id, p_salt, p_hash, p_expires_at, 5, now())
  ON CONFLICT (user_id) DO UPDATE SET
    otp_salt = EXCLUDED.otp_salt,
    otp_hash = EXCLUDED.otp_hash,
    expires_at = EXCLUDED.expires_at,
    attempts_remaining = 5,
    created_at = now();
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.axa_auth_otp_get(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
DECLARE
  otp axa_auth_otps%ROWTYPE;
BEGIN
  SELECT * INTO otp
  FROM axa_private.axa_auth_otps
  WHERE user_id = p_user_id
    AND expires_at > now()
    AND attempts_remaining > 0;
  IF NOT FOUND THEN
    DELETE FROM axa_private.axa_auth_otps WHERE user_id = p_user_id;
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'salt', otp.otp_salt,
    'hash', otp.otp_hash,
    'expiresAt', otp.expires_at,
    'attemptsRemaining', otp.attempts_remaining
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.axa_auth_otp_fail(p_user_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
DECLARE
  remaining integer;
BEGIN
  UPDATE axa_private.axa_auth_otps
  SET attempts_remaining = attempts_remaining - 1
  WHERE user_id = p_user_id
    AND expires_at > now()
    AND attempts_remaining > 0
  RETURNING attempts_remaining INTO remaining;
  IF NOT FOUND THEN
    DELETE FROM axa_private.axa_auth_otps WHERE user_id = p_user_id;
    RETURN 0;
  END IF;
  IF remaining = 0 THEN
    DELETE FROM axa_private.axa_auth_otps WHERE user_id = p_user_id;
  END IF;
  RETURN remaining;
END;
$function$;

CREATE OR REPLACE FUNCTION public.axa_auth_otp_consume(p_user_id text, p_expected_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
  WITH consumed AS (
    DELETE FROM axa_private.axa_auth_otps
    WHERE user_id = p_user_id
      AND otp_hash = p_expected_hash
      AND expires_at > now()
      AND attempts_remaining > 0
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM consumed);
$function$;

CREATE OR REPLACE FUNCTION public.axa_auth_otp_delete(p_user_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, axa_private
AS $function$
  WITH removed AS (
    DELETE FROM axa_private.axa_auth_otps WHERE user_id = p_user_id RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM removed);
$function$;

REVOKE ALL ON FUNCTION public.axa_auth_otp_set(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_auth_otp_get(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_auth_otp_fail(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_auth_otp_consume(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.axa_auth_otp_delete(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.axa_auth_otp_set(text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_auth_otp_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_auth_otp_fail(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_auth_otp_consume(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.axa_auth_otp_delete(text) TO service_role;
