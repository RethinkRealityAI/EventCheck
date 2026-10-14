-- Badge printing: permanent registration codes + a record of every print export.
--
-- GANSID's on-site registration vendor (MICE IDEAS) prints badges from a
-- spreadsheet in their own format, in batches, as registrations keep arriving.
-- Two things make that work without misprints:
--
-- 1. attendees.reg_code — "GSD_IND_001" / "GSD_INT_001". Printed on the badge
--    and used at the desk, so it must never change once issued. Assigned
--    lazily, in registration order, the first time a row appears on the
--    Badge Printing tab (the IND/INT split needs the dashboard's country
--    resolution, so the client proposes the region and the server owns the
--    numbering). Numbers are never reused.
--
-- 2. print_exports / print_export_rows — each export is a numbered batch with
--    a snapshot of exactly what was printed for each person. The tab compares
--    that snapshot with today's data to show "not printed", "printed in batch
--    #n" or "changed since printed", so the vendor reprints only what moved.
--
-- Read-only viewer accounts (the vendor) must be able to do both, but nothing
-- else: they write ONLY through the two SECURITY DEFINER functions below,
-- which check is_portal_viewer() (admin, super_admin or viewer) themselves.

ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS reg_code text;
CREATE UNIQUE INDEX IF NOT EXISTS attendees_reg_code_key ON public.attendees (reg_code) WHERE reg_code IS NOT NULL;

-- ── Assign codes ───────────────────────────────────────────────────────────
-- p_items: [{ "id": "<attendee id>", "region": "IND" | "INT" }, …]
-- Rows that already hold a code are left alone; the rest are numbered in
-- registered_at order after the highest existing number for their prefix.
-- Returns the codes now held by the requested rows.
CREATE OR REPLACE FUNCTION public.assign_reg_codes(p_items jsonb)
RETURNS TABLE (id text, reg_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_prefix text;
  v_next int;
BEGIN
  IF NOT public.is_portal_viewer() THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  -- One numbering run at a time, so two people opening the tab together
  -- cannot hand out the same number.
  PERFORM pg_advisory_xact_lock(hashtext('assign_reg_codes'));

  FOR r IN
    SELECT a.id AS aid,
           CASE WHEN upper(i->>'region') = 'INT' THEN 'INT' ELSE 'IND' END AS region
      FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
      JOIN public.attendees a ON a.id = i->>'id'
     WHERE a.reg_code IS NULL
     ORDER BY a.registered_at, a.id
  LOOP
    v_prefix := 'GSD_' || r.region || '_';
    SELECT coalesce(max(substring(a2.reg_code FROM length(v_prefix) + 1)::int), 0) + 1
      INTO v_next
      FROM public.attendees a2
     WHERE a2.reg_code LIKE v_prefix || '%'
       AND substring(a2.reg_code FROM length(v_prefix) + 1) ~ '^[0-9]+$';
    UPDATE public.attendees
       SET reg_code = v_prefix || lpad(v_next::text, 3, '0')
     WHERE attendees.id = r.aid;
  END LOOP;

  RETURN QUERY
    SELECT a.id, a.reg_code
      FROM public.attendees a
     WHERE a.id IN (SELECT i->>'id' FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_reg_codes(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_reg_codes(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_reg_codes(jsonb) TO authenticated;

-- ── Print history ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_exports (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_email text,
  label text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.print_export_rows (
  export_id bigint NOT NULL REFERENCES public.print_exports (id) ON DELETE CASCADE,
  attendee_id text NOT NULL,
  fingerprint text NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (export_id, attendee_id)
);
CREATE INDEX IF NOT EXISTS print_export_rows_attendee_idx ON public.print_export_rows (attendee_id, export_id DESC);

ALTER TABLE public.print_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_export_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_exports_viewer_read ON public.print_exports;
CREATE POLICY print_exports_viewer_read ON public.print_exports
  FOR SELECT TO authenticated USING (public.is_portal_viewer());
DROP POLICY IF EXISTS print_export_rows_viewer_read ON public.print_export_rows;
CREATE POLICY print_export_rows_viewer_read ON public.print_export_rows
  FOR SELECT TO authenticated USING (public.is_portal_viewer());
-- No INSERT/UPDATE/DELETE policies: writes go through record_print_export only.

-- p_rows: [{ "attendee_id": "…", "fingerprint": "…", "snapshot": {…} }, …]
CREATE OR REPLACE FUNCTION public.record_print_export(p_label text, p_filters jsonb, p_rows jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_count int;
BEGIN
  IF NOT public.is_portal_viewer() THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  v_count := coalesce(jsonb_array_length(p_rows), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'nothing to record';
  END IF;

  INSERT INTO public.print_exports (created_by, created_by_email, label, filters, row_count)
  VALUES (auth.uid(), auth.jwt() ->> 'email', nullif(btrim(coalesce(p_label, '')), ''), coalesce(p_filters, '{}'::jsonb), v_count)
  RETURNING id INTO v_id;

  INSERT INTO public.print_export_rows (export_id, attendee_id, fingerprint, snapshot)
  SELECT v_id, r->>'attendee_id', coalesce(r->>'fingerprint', ''), coalesce(r->'snapshot', '{}'::jsonb)
    FROM jsonb_array_elements(p_rows) r
   WHERE coalesce(r->>'attendee_id', '') <> ''
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_print_export(text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_print_export(text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_print_export(text, jsonb, jsonb) TO authenticated;
