-- 20260620000000_promo_global_usage_limit_trigger.sql
--
-- Extends the free-promo usage-limit trigger to also enforce a new
-- `totalUsageLimit` field on PromoCode — a single cap across ALL eligible
-- categories combined (complementing the existing per-category `usageLimits`).
--
-- When both are set, both constraints apply (the tighter one wins):
--   - totalUsageLimit: 50  → code can be used at most 50 times total
--   - usageLimits.physician: 20  → physicians specifically capped at 20
--
-- Lock ordering (prevents deadlock):
--   Global lock (form + code) is always acquired BEFORE the per-category lock
--   (form + code + category). Concurrent inserts for different categories
--   therefore all queue on the global lock first, then fan out to their own
--   per-category locks — ensuring the global count is always serialized.
--
-- Scope is unchanged: FREE rows only (payment_status = 'free').
-- Defensive: any guard-internal error returns NEW (registration never blocked
-- by a guard bug — only an explicit limit check rejects).

CREATE OR REPLACE FUNCTION public.enforce_free_promo_usage_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings    jsonb;
  v_promo       jsonb;
  v_total_limit int := NULL;
  v_cat_limit   int := NULL;
  v_count       int;
BEGIN
  -- Only guard free, promo-stamped, non-test registration rows with a category.
  IF NEW.applied_promo_code IS NULL
     OR NEW.payment_status IS DISTINCT FROM 'free'
     OR NEW.is_test IS TRUE
     OR NEW.pricing_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve both limits from the form's promo definitions.
  BEGIN
    SELECT settings INTO v_settings FROM forms WHERE id = NEW.form_id;
    IF v_settings IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT p INTO v_promo
    FROM jsonb_array_elements(COALESCE(v_settings->'promoCodes', '[]'::jsonb)) AS p
    WHERE lower(p->>'code') = lower(NEW.applied_promo_code)
    LIMIT 1;
    IF v_promo IS NULL THEN
      RETURN NEW;
    END IF;

    v_total_limit := NULLIF(v_promo->>'totalUsageLimit', '')::int;
    v_cat_limit   := NULLIF(v_promo->'usageLimits'->>NEW.pricing_category_id, '')::int;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- ── Global limit check ────────────────────────────────────────────────────
  -- Acquired first so all concurrent inserts for this (form, code) pair
  -- serialize here regardless of which category they're registering into.
  IF v_total_limit IS NOT NULL AND v_total_limit > 0 THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(NEW.form_id::text || ':' || lower(NEW.applied_promo_code))
    );

    SELECT count(*) INTO v_count
    FROM attendees
    WHERE form_id = NEW.form_id
      AND lower(applied_promo_code) = lower(NEW.applied_promo_code)
      AND (is_test IS NULL OR is_test = false);

    IF v_count >= v_total_limit THEN
      RAISE EXCEPTION 'PROMO_USAGE_LIMIT_EXCEEDED'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Per-category limit check ──────────────────────────────────────────────
  IF v_cat_limit IS NOT NULL AND v_cat_limit > 0 THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(NEW.form_id::text || ':' || lower(NEW.applied_promo_code) || ':' || NEW.pricing_category_id)
    );

    SELECT count(*) INTO v_count
    FROM attendees
    WHERE form_id = NEW.form_id
      AND lower(applied_promo_code) = lower(NEW.applied_promo_code)
      AND pricing_category_id = NEW.pricing_category_id
      AND (is_test IS NULL OR is_test = false);

    IF v_count >= v_cat_limit THEN
      RAISE EXCEPTION 'PROMO_USAGE_LIMIT_EXCEEDED'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_free_promo_usage_limit ON public.attendees;
CREATE TRIGGER trg_enforce_free_promo_usage_limit
  BEFORE INSERT ON public.attendees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_promo_usage_limit();
