-- Add reactions JSONB column to ticket_comments
-- Stores: {"👍": ["userId1", "userId2"], "❤️": ["userId3"]}
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}';
