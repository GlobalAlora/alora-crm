-- ═══════════════════════════════════════════════════════════════════════════════
-- WhatsApp Cloud API — Complete Setup Migration
-- Run once in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS / OR REPLACE)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. channel_configs ────────────────────────────────────────────────────────
-- Stores credentials and state for each messaging channel (WhatsApp, etc.)

CREATE TABLE IF NOT EXISTS channel_configs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type        text        NOT NULL CHECK (channel_type IN ('whatsapp', 'instagram')),
  label               text        NOT NULL DEFAULT 'Principal',
  phone_number_id     text,
  business_account_id text,
  access_token        text,
  verify_token        text,
  webhook_url         text,
  is_active           boolean     NOT NULL DEFAULT true,
  last_message_at     timestamptz,
  last_error          text,
  last_error_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
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

DROP POLICY IF EXISTS "auth_read_channel_configs"    ON channel_configs;
DROP POLICY IF EXISTS "service_write_channel_configs" ON channel_configs;

CREATE POLICY "auth_read_channel_configs"
  ON channel_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_channel_configs"
  ON channel_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed placeholder row (the app upserts real values when user saves settings)
INSERT INTO channel_configs (channel_type, label, phone_number_id, access_token, verify_token)
VALUES ('whatsapp', 'Principal', NULL, NULL, NULL)
ON CONFLICT (channel_type, label) DO NOTHING;


-- ── 2. whatsapp_conversations ─────────────────────────────────────────────────
-- One row per unique phone number — represents a single conversation thread.

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number      text        NOT NULL UNIQUE,
  lead_id           uuid        REFERENCES leads(id) ON DELETE SET NULL,
  last_message_at   timestamptz DEFAULT now(),
  last_message_text text,
  unread_count      integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_wa_conv_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conv_updated_at ON whatsapp_conversations;
CREATE TRIGGER trg_wa_conv_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION trg_wa_conv_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone    ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_conv_lead     ON whatsapp_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status   ON whatsapp_conversations(status);

-- RLS
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_wa_conversations"  ON whatsapp_conversations;
DROP POLICY IF EXISTS "auth_update_wa_conversations"  ON whatsapp_conversations;
DROP POLICY IF EXISTS "auth_insert_wa_conversations"  ON whatsapp_conversations;
DROP POLICY IF EXISTS "service_wa_conversations"      ON whatsapp_conversations;

CREATE POLICY "auth_select_wa_conversations"
  ON whatsapp_conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_update_wa_conversations"
  ON whatsapp_conversations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_insert_wa_conversations"
  ON whatsapp_conversations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "service_wa_conversations"
  ON whatsapp_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. upsert_wa_conversation RPC ─────────────────────────────────────────────
-- Atomic insert-or-update called from the webhook handler.
-- Inserts conversation on first message; increments unread_count on subsequent ones.

CREATE OR REPLACE FUNCTION upsert_wa_conversation(
  p_phone     text,
  p_lead_id   uuid,
  p_last_text text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO whatsapp_conversations
    (phone_number, lead_id, last_message_at, last_message_text, unread_count)
  VALUES
    (p_phone, p_lead_id, now(), p_last_text, 1)
  ON CONFLICT (phone_number) DO UPDATE SET
    lead_id           = EXCLUDED.lead_id,
    last_message_at   = now(),
    last_message_text = p_last_text,
    unread_count      = whatsapp_conversations.unread_count + 1,
    updated_at        = now();
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION upsert_wa_conversation(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_wa_conversation(text, uuid, text) TO service_role;


-- ── 4. Realtime publications ──────────────────────────────────────────────────
-- Enable realtime for both tables so the inbox updates live.

DO $$
BEGIN
  -- whatsapp_conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
  END IF;

  -- activities (needed for ChatView live message updates)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE activities;
  END IF;
END;
$$;


-- ── 5. REPLICA IDENTITY for filtered realtime on activities ───────────────────
-- Allows filtering postgres_changes by column values (e.g. tipo=eq.whatsapp).
-- Safe to run even if already set.

ALTER TABLE activities REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_conversations REPLICA IDENTITY FULL;
