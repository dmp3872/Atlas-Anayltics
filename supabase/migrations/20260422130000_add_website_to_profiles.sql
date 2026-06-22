-- Add website field to user profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS website text DEFAULT '';

-- Keep updated_at current on profile changes
CREATE OR REPLACE FUNCTION public.set_user_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_user_profiles_updated_at();
