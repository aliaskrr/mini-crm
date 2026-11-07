-- Runs once, when the data volume is first initialised.
-- GoTrue logs in as supabase_auth_admin and PostgREST as authenticator; both get the
-- generated POSTGRES_PASSWORD from .env (the image ships them without a usable password).
\set pgpass `echo "$POSTGRES_PASSWORD"`

alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
