-- Bank reconciliation rules (US-ACC-029) let a user store a POSIX regex
-- (`description_regex`) that is later evaluated against every unmatched
-- transaction via `~`. Checking it with a JS RegExp at write time is not
-- enough: Postgres's ARE dialect diverges from JS regex (backreferences,
-- POSIX character classes, lookbehind), so a pattern that passes JS
-- validation can still raise `invalid_regular_expression` from Postgres —
-- turning every future apply-rules run into a 500, not just the create.
-- Same shape as the JWT claim parsers (L62): an expression that can raise,
-- in a context that must not, gets wrapped in a function that returns the
-- closed answer instead.
CREATE OR REPLACE FUNCTION app.is_valid_regex(pattern text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
BEGIN
    PERFORM '' ~ pattern;
    RETURN true;
EXCEPTION WHEN invalid_regular_expression THEN
    RETURN false;
END $function$;

GRANT EXECUTE ON FUNCTION app.is_valid_regex(text) TO app_user;
