-- Enable Row Level Security (RLS) on all public tables to prevent unauthorized access via PostgREST / Supabase Data API
alter table playable_audio enable row level security;
alter table contacts enable row level security;
alter table installs enable row level security;

-- Revoke direct permissions from Data API roles (anon, authenticated)
-- All client access is mediated through server-side Next.js route handlers using DATABASE_URL
revoke all on table playable_audio from anon, authenticated;
revoke all on table contacts from anon, authenticated;
revoke all on table installs from anon, authenticated;
