-- ── WhatsApp Inbox — run in Supabase SQL Editor ──────────────────────────────

-- Table: one row per unique phone number (= one conversation)
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number     text        NOT NULL UNIQUE,
  lead_id          uuid        REFERENCES leads(id) ON DELETE SET NULL,
  last_message_at  timestamptz DEFAULT now(),
  last_message_text text,
  unread_count     integer     DEFAULT 0 NOT NULL,
  status           text        DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_conv_updated_at ON whatsapp_conversations;
CREATE TRIGGER trg_wa_conv_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select conversations"
  ON whatsapp_conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can update conversations"
  ON whatsapp_conversations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can insert conversations"
  ON whatsapp_conversations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role full access conversations"
  ON whatsapp_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone    ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_conv_lead     ON whatsapp_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_last_msg ON whatsapp_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status   ON whatsapp_conversations(status);

-- ── Atomic upsert function (called from webhook) ──────────────────────────────
-- Inserts conversation on first message, increments unread_count on subsequent ones.
CREATE OR REPLACE FUNCTION upsert_wa_conversation(
  p_phone    text,
  p_lead_id  uuid,
  p_last_text text
) RETURNS void AS $$
BEGIN
  INSERT INTO whatsapp_conversations (phone_number, lead_id, last_message_at, last_message_text, unread_count)
  VALUES (p_phone, p_lead_id, now(), p_last_text, 1)
  ON CONFLICT (phone_number) DO UPDATE SET
    lead_id           = EXCLUDED.lead_id,
    last_message_at   = now(),
    last_message_text = p_last_text,
    unread_count      = whatsapp_conversations.unread_count + 1,
    updated_at        = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Realtime for both tables ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
-- Uncomment if activities is not already in the realtime publication:
-- ALTER PUBLICATION supabase_realtime ADD TABLE activities;
