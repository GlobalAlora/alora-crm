-- ============================================================
-- Email Marketing Module
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. TAGS
CREATE TABLE IF NOT EXISTS public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_tag_relations (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id  uuid NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

-- 2. LISTS
CREATE TABLE IF NOT EXISTS public.lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.list_leads (
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, lead_id)
);

-- 3. CAMPAIGNS
CREATE TABLE IF NOT EXISTS public.campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  subject      text NOT NULL,
  body         text NOT NULL,
  from_name    text NOT NULL DEFAULT 'Alora CRM',
  from_email   text NOT NULL DEFAULT 'noreply@globalalora.com',
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  -- Segment filters stored as JSONB
  filters      jsonb,
  -- Stats
  total_sent   int NOT NULL DEFAULT 0,
  total_failed int NOT NULL DEFAULT 0,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  email       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at     timestamptz,
  error       text,
  UNIQUE (campaign_id, lead_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS lead_tag_relations_lead_idx ON public.lead_tag_relations(lead_id);
CREATE INDEX IF NOT EXISTS lead_tag_relations_tag_idx  ON public.lead_tag_relations(tag_id);
CREATE INDEX IF NOT EXISTS list_leads_list_idx         ON public.list_leads(list_id);
CREATE INDEX IF NOT EXISTS list_leads_lead_idx         ON public.list_leads(lead_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_idx ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_status_idx   ON public.campaign_recipients(status);

-- RLS: enable and allow authenticated users full access (adjust per your policy)
ALTER TABLE public.lead_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_relations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients   ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can do everything
CREATE POLICY "auth_all" ON public.lead_tags           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.lead_tag_relations  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.lists               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.list_leads          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.campaigns           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
