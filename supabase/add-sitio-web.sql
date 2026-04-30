-- Add sitio_web column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sitio_web text;
