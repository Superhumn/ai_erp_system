-- ============================================================================
-- SUPERHUMN CRM — full migration, run top to bottom in Supabase SQL editor
-- Covers: schema, exact dedup, fuzzy near-dedup, email→company auto-link
-- Safe to re-run. Uses IF NOT EXISTS everywhere.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS (pg_trgm powers the fuzzy similarity matching)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- for fuzzy name matching

-- ----------------------------------------------------------------------------
-- 1. NORMALIZATION HELPERS
-- ----------------------------------------------------------------------------

-- Strips "Deal from:", lowercases, collapses whitespace. Drives exact dedup.
CREATE OR REPLACE FUNCTION normalize_deal_name(name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(name,''), '^deal from:\s*', '', 'i'), '\s+', ' ', 'g'));
$$;

-- Domain from an email address (e.g. "jane@wesgro.co.za" -> "wesgro.co.za")
CREATE OR REPLACE FUNCTION email_domain(email TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(split_part(coalesce(email,''), '@', 2));
$$;

-- Strips public/free-mail domains so we don't auto-link Gmail/etc. to a company
CREATE OR REPLACE FUNCTION is_business_domain(domain TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT domain IS NOT NULL AND domain <> '' AND domain NOT IN (
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com',
    'outlook.com','live.com','icloud.com','me.com','mac.com','aol.com',
    'proton.me','protonmail.com','pm.me','msn.com','duck.com'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. CORE TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  domain        TEXT UNIQUE,
  website       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_name_unique ON crm_companies (lower(name));

CREATE TABLE IF NOT EXISTS crm_deals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  company_id    UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  value_cents   BIGINT DEFAULT 0,
  stage         TEXT NOT NULL DEFAULT 'discovery'
                CHECK (stage IN ('discovery','qualified','proposal','negotiation','closed-won','closed-lost')),
  owner_id      UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- THE EXACT-DEDUP CONSTRAINT: same normalized name can't exist twice
CREATE UNIQUE INDEX IF NOT EXISTS crm_deals_normalized_name_unique
  ON crm_deals (normalize_deal_name(name));

-- TRIGRAM INDEX powers fast fuzzy lookups (the % similarity operator)
CREATE INDEX IF NOT EXISTS crm_deals_name_trgm
  ON crm_deals USING gin (normalize_deal_name(name) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  company_id    UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique
  ON crm_contacts (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_deal_contacts (
  deal_id       UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  role          TEXT,
  is_primary    BOOLEAN DEFAULT FALSE,
  added_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (deal_id, contact_id)
);
CREATE INDEX IF NOT EXISTS crm_deal_contacts_contact_idx ON crm_deal_contacts(contact_id);

CREATE TABLE IF NOT EXISTS crm_deal_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,
  external_id   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. COMPANY AUTO-LINK FROM EMAIL DOMAIN
-- ----------------------------------------------------------------------------

-- Finds an existing company by domain, or creates one. Returns company_id.
CREATE OR REPLACE FUNCTION find_or_create_company_by_email(
  p_email TEXT,
  p_company_hint TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_domain  TEXT := email_domain(p_email);
  v_company_id UUID;
  v_name    TEXT;
BEGIN
  IF NOT is_business_domain(v_domain) THEN
    -- Public domain (gmail etc.) — only create company if we have a name hint
    IF p_company_hint IS NULL OR p_company_hint = '' THEN RETURN NULL; END IF;
    SELECT id INTO v_company_id FROM crm_companies WHERE lower(name) = lower(p_company_hint) LIMIT 1;
    IF v_company_id IS NULL THEN
      INSERT INTO crm_companies (name) VALUES (p_company_hint) RETURNING id INTO v_company_id;
    END IF;
    RETURN v_company_id;
  END IF;

  -- Business domain — match by domain first
  SELECT id INTO v_company_id FROM crm_companies WHERE domain = v_domain LIMIT 1;
  IF v_company_id IS NOT NULL THEN RETURN v_company_id; END IF;

  -- Not found by domain. Use hint name, else derive from domain ("wesgro.co.za" -> "Wesgro")
  v_name := coalesce(
    nullif(p_company_hint, ''),
    initcap(split_part(v_domain, '.', 1))
  );

  -- Match by name if a row already exists (no domain set yet) and attach the domain
  SELECT id INTO v_company_id FROM crm_companies WHERE lower(name) = lower(v_name) LIMIT 1;
  IF v_company_id IS NOT NULL THEN
    UPDATE crm_companies SET domain = v_domain WHERE id = v_company_id AND domain IS NULL;
    RETURN v_company_id;
  END IF;

  INSERT INTO crm_companies (name, domain) VALUES (v_name, v_domain) RETURNING id INTO v_company_id;
  RETURN v_company_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. FUZZY DEAL MATCH (catches "Marc & Jade" vs "Marc and Jade")
-- ----------------------------------------------------------------------------
-- Returns the deal_id of the closest existing match above the threshold, or NULL.
-- Default 0.7 = strict enough to avoid false merges. Tune later if needed.
CREATE OR REPLACE FUNCTION find_similar_deal(
  p_deal_name TEXT,
  p_threshold REAL DEFAULT 0.7
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_norm TEXT := normalize_deal_name(p_deal_name);
  v_id   UUID;
BEGIN
  -- Exact normalized match wins immediately
  SELECT id INTO v_id FROM crm_deals
   WHERE normalize_deal_name(name) = v_norm LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Fuzzy: highest similarity above threshold
  SELECT id INTO v_id FROM crm_deals
   WHERE similarity(normalize_deal_name(name), v_norm) > p_threshold
   ORDER BY similarity(normalize_deal_name(name), v_norm) DESC
   LIMIT 1;
  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. THE ONE UPSERT FUNCTION (intake door for Fireflies, Sheets, manual)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_deal_with_contact(
  p_deal_name     TEXT,
  p_contact_name  TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_company_name  TEXT DEFAULT NULL,
  p_source        TEXT DEFAULT 'manual',
  p_external_id   TEXT DEFAULT NULL,
  p_fuzzy_threshold REAL DEFAULT 0.7
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_deal_id     UUID;
  v_contact_id  UUID;
  v_company_id  UUID;
BEGIN
  -- Resolve company from email domain or hint
  IF p_contact_email IS NOT NULL OR p_company_name IS NOT NULL THEN
    v_company_id := find_or_create_company_by_email(p_contact_email, p_company_hint => p_company_name);
  END IF;

  -- Find existing deal (exact or fuzzy)
  v_deal_id := find_similar_deal(p_deal_name, p_fuzzy_threshold);

  IF v_deal_id IS NULL THEN
    INSERT INTO crm_deals (name, company_id) VALUES (p_deal_name, v_company_id)
    RETURNING id INTO v_deal_id;
  ELSE
    -- Backfill company on existing deal if we now know it
    UPDATE crm_deals SET company_id = v_company_id
     WHERE id = v_deal_id AND company_id IS NULL AND v_company_id IS NOT NULL;
  END IF;

  -- Find or create contact
  IF p_contact_email IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM crm_contacts WHERE lower(email) = lower(p_contact_email) LIMIT 1;
    IF v_contact_id IS NULL THEN
      INSERT INTO crm_contacts (name, email, company_id)
      VALUES (coalesce(p_contact_name, p_contact_email), p_contact_email, v_company_id)
      RETURNING id INTO v_contact_id;
    ELSE
      UPDATE crm_contacts SET company_id = v_company_id
       WHERE id = v_contact_id AND company_id IS NULL AND v_company_id IS NOT NULL;
    END IF;
  ELSIF p_contact_name IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM crm_contacts WHERE lower(name) = lower(p_contact_name) LIMIT 1;
    IF v_contact_id IS NULL THEN
      INSERT INTO crm_contacts (name, company_id) VALUES (p_contact_name, v_company_id)
      RETURNING id INTO v_contact_id;
    END IF;
  END IF;

  -- Link contact to deal (no-op if already linked)
  IF v_contact_id IS NOT NULL THEN
    INSERT INTO crm_deal_contacts (deal_id, contact_id) VALUES (v_deal_id, v_contact_id)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO crm_deal_sources (deal_id, source, external_id) VALUES (v_deal_id, p_source, p_external_id);
  UPDATE crm_deals SET updated_at = now() WHERE id = v_deal_id;
  RETURN v_deal_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. VIEWS for the UI
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW crm_deals_enriched AS
SELECT
  d.id, d.name, d.value_cents, d.stage, d.updated_at,
  co.name AS company_name, co.domain AS company_domain,
  coalesce(
    json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email))
      FILTER (WHERE c.id IS NOT NULL), '[]'
  ) AS contacts,
  coalesce(array_agg(DISTINCT s.source) FILTER (WHERE s.source IS NOT NULL), ARRAY[]::TEXT[]) AS sources,
  count(DISTINCT c.id) AS contact_count
FROM crm_deals d
LEFT JOIN crm_companies co ON co.id = d.company_id
LEFT JOIN crm_deal_contacts dc ON dc.deal_id = d.id
LEFT JOIN crm_contacts c ON c.id = dc.contact_id
LEFT JOIN crm_deal_sources s ON s.deal_id = d.id
GROUP BY d.id, co.name, co.domain;

CREATE OR REPLACE VIEW crm_contacts_enriched AS
SELECT
  c.id, c.name, c.email,
  co.name AS company_name, co.domain AS company_domain,
  coalesce(
    json_agg(DISTINCT jsonb_build_object('id', d.id, 'name', d.name, 'stage', d.stage, 'value_cents', d.value_cents))
      FILTER (WHERE d.id IS NOT NULL), '[]'
  ) AS deals,
  count(DISTINCT d.id) AS deal_count,
  coalesce(sum(d.value_cents), 0) AS total_pipeline_cents
FROM crm_contacts c
LEFT JOIN crm_companies co ON co.id = c.company_id
LEFT JOIN crm_deal_contacts dc ON dc.contact_id = c.id
LEFT JOIN crm_deals d ON d.id = dc.deal_id
GROUP BY c.id, co.name, co.domain;

-- ----------------------------------------------------------------------------
-- 7. ADMIN HELPER: review fuzzy match candidates before merging old data
-- Returns pairs of deals whose names are similar but not identical.
-- Run this manually after backfill to spot near-dupes the auto-merger may miss.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION review_similar_deals(p_threshold REAL DEFAULT 0.6)
RETURNS TABLE (deal_a_id UUID, deal_a_name TEXT, deal_b_id UUID, deal_b_name TEXT, similarity REAL)
LANGUAGE sql AS $$
  SELECT a.id, a.name, b.id, b.name,
         similarity(normalize_deal_name(a.name), normalize_deal_name(b.name)) AS similarity
  FROM crm_deals a
  JOIN crm_deals b ON a.id < b.id
  WHERE similarity(normalize_deal_name(a.name), normalize_deal_name(b.name)) > p_threshold
  ORDER BY similarity DESC;
$$;

-- ----------------------------------------------------------------------------
-- 8. ADMIN: manually merge two deals (call this after reviewing with #7)
-- Moves all contacts and sources from b → a, then deletes b.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_deals(p_keep_id UUID, p_drop_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO crm_deal_contacts (deal_id, contact_id, role, is_primary)
    SELECT p_keep_id, contact_id, role, is_primary FROM crm_deal_contacts WHERE deal_id = p_drop_id
    ON CONFLICT DO NOTHING;
  UPDATE crm_deal_sources SET deal_id = p_keep_id WHERE deal_id = p_drop_id;
  DELETE FROM crm_deals WHERE id = p_drop_id;
  UPDATE crm_deals SET updated_at = now() WHERE id = p_keep_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. QUICK SANITY CHECKS — run these to verify the migration worked
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM crm_deals;
-- SELECT count(*) FROM crm_contacts;
-- SELECT count(*) FROM crm_companies;
-- SELECT * FROM review_similar_deals(0.5) LIMIT 20;
-- SELECT * FROM crm_deals_enriched LIMIT 5;
