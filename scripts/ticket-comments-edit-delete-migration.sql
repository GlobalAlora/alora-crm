-- Allow editing/soft-deleting ticket comments from the internal tickets UI.
alter table ticket_comments
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz;
