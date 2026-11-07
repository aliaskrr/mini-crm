-- Runs once, when the data volume is first initialised (as in Supabase's own self-hosting files).
\set jwt_exp `echo "$JWT_EXP"`

alter database postgres set "app.settings.jwt_exp" to :'jwt_exp';
