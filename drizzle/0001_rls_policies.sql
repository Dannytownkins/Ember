-- Row-Level Security for Ember
-- Enforces tenant isolation at the database level.
-- All queries must SET LOCAL app.user_id before accessing these tables.

-- Enable RLS on all user-data tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (prevents accidental bypass)
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE captures FORCE ROW LEVEL SECURITY;
ALTER TABLE memories FORCE ROW LEVEL SECURITY;
ALTER TABLE api_tokens FORCE ROW LEVEL SECURITY;

-- Profiles: user can only see their own profiles
CREATE POLICY profile_user_isolation ON profiles
  USING (user_id = (
    SELECT id FROM users WHERE id = current_setting('app.user_id', true)::uuid
  ));

-- Captures: user can only see captures on their own profiles
CREATE POLICY capture_user_isolation ON captures
  USING (profile_id IN (
    SELECT id FROM profiles WHERE user_id = current_setting('app.user_id', true)::uuid
  ));

-- Memories: user can only see memories on their own profiles
CREATE POLICY memory_user_isolation ON memories
  USING (profile_id IN (
    SELECT id FROM profiles WHERE user_id = current_setting('app.user_id', true)::uuid
  ));

-- API Tokens: user can only see their own tokens
CREATE POLICY api_token_user_isolation ON api_tokens
  USING (user_id = current_setting('app.user_id', true)::uuid);
