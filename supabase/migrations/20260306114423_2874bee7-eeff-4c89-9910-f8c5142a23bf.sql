
-- Update handle_new_user to also create workspace, workspace_member, and workspace_settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_workspace_id UUID;
  ws_name TEXT;
BEGIN
  -- Create user_profile
  INSERT INTO public.user_profiles (user_id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create workspace automatically
  ws_name := COALESCE(
    NEW.raw_user_meta_data->>'workspace_name',
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || '''s Workspace'
  );

  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES (ws_name, NEW.id)
  RETURNING id INTO new_workspace_id;

  -- Associate user as admin
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'admin')
  ON CONFLICT DO NOTHING;

  -- Create workspace settings with defaults
  INSERT INTO public.workspace_settings (workspace_id)
  VALUES (new_workspace_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

-- Add unique constraint to user_profiles.user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
  END IF;
END;
$$;
