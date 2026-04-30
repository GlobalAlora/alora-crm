-- Channel configs for multi-channel messaging (WhatsApp, Instagram DM, etc.)
CREATE TABLE IF NOT EXISTS channel_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type    text NOT NULL CHECK (channel_type IN ('whatsapp', 'instagram')),
  label           text NOT NULL DEFAULT 'Principal',
  phone_number_id text,
  business_account_id text,
  access_token    text,
  verify_token    text,
  webhook_url     text,
  is_active       boolean NOT NULL DEFAULT true,
  last_message_at timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_type, label)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_channel_configs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_channel_configs_updated_at ON channel_configs;
CREATE TRIGGER trg_channel_configs_updated_at
  BEFORE UPDATE ON channel_configs
  FOR EACH ROW EXECUTE FUNCTION trg_channel_configs_updated_at();

-- RLS
ALTER TABLE channel_configs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "auth_read_channel_configs"
  ON channel_configs FOR SELECT
  TO authenticated USING (true);

-- Only service_role can write (admin API routes use admin client)
CREATE POLICY "service_write_channel_configs"
  ON channel_configs FOR ALL
  TO service_role USING (true);

-- Seed initial WhatsApp config row from env vars placeholder
-- (the app will upsert real values when user saves settings)
INSERT INTO channel_configs (channel_type, label, phone_number_id, access_token, verify_token)
VALUES ('whatsapp', 'Principal', NULL, NULL, NULL)
ON CONFLICT (channel_type, label) DO NOTHING;
