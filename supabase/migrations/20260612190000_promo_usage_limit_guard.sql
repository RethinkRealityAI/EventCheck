-- 20260612190000_promo_usage_limit_guard.sql
--
-- Race-free enforcement of per-category promo usage limits for FREE promo
-- registrations (speaker comps + 100%-off codes — the highest-value abuse
-- vector).
--
-- Why a trigger and not just the edge-function pre-check:
--   verify-payment's `assertPromoCheckoutAllowed` counts existing redemptions
--   then inserts in a separate round-trip. Two simultaneous submissions for
--   the same (form, code, category) can both pass the count and both insert,
--   over-redeeming a limited code by one. A BEFORE INSERT trigger that takes a
--   transaction-scoped advisory lock closes the race: the lock is held until
--   COMMIT, so the second transaction waits, then re-counts and sees the
--   first's committed row.
--
-- Scope — FREE rows only (payment_status = 'free'):
--   Rejecting an insert AFTER an irreversible PayPal capture would take money
--   without issuing a ticket, so paid-promo races stay best-effort via the
--   pre-check. Free rows have no capture, so a hard reject here is safe.
--   This still covers every speaker / 100%-off code, where the limit matters
--   most. BOGO free rows (applied_promo_code IS NULL) are untouched.
--
-- Defensive: any guard-internal error (missing form, malformed settings JSON)
-- returns NEW so a real registration is never blocked by a guard bug — only
-- the explicit limit check rejects.

CREATE OR REPLACE FUNCTION public.enforce_free_promo_usage_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_promo    jsonb;
  v_limit    int := NULL;
  v_count    int;
BEGIN
  -- Only guard free, promo-stamped, non-test registration rows with a category.
  IF NEW.applied_promo_code IS NULL
     OR NEW.payment_status IS DISTINCT FROM 'free'
     OR NEW.is_test IS TRUE
     OR NEW.pricing_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the per-category limit from the form's promo definitions. Any
  -- failure here must not block the registration.
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

    v_limit := NULLIF(v_promo->'usageLimits'->>NEW.pricing_category_id, '')::int;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF v_limit IS NULL OR v_limit <= 0 THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent inserts for this (form, code, category). The lock is
  -- transaction-scoped, so a waiting txn only proceeds after the holder commits
  -- and its row becomes visible to the count below.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.form_id::text || ':' || lower(NEW.applied_promo_code) || ':' || NEW.pricing_category_id)
  );

  SELECT count(*) INTO v_count
  FROM attendees
  WHERE form_id = NEW.form_id
    AND lower(applied_promo_code) = lower(NEW.applied_promo_code)
    AND pricing_category_id = NEW.pricing_category_id
    AND (is_test IS NULL OR is_test = false);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PROMO_USAGE_LIMIT_EXCEEDED'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_free_promo_usage_limit ON public.attendees;
CREATE TRIGGER trg_enforce_free_promo_usage_limit
  BEFORE INSERT ON public.attendees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_promo_usage_limit();
