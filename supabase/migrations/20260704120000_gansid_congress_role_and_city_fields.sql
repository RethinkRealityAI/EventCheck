-- GANSID Congress paid + invite forms: Affiliation step gets Role (f_role);
-- City (f_city) moves to Personal Details after Country.
-- Idempotent — safe to re-run.

DO $$
DECLARE
  form_id text;
  f jsonb;
  elem jsonb;
  new_fields jsonb;
  i int;
  len int;
  role_field jsonb;
  city_field jsonb;
  has_role boolean;
  city_in_personal boolean;
  skip_affil_city boolean;
BEGIN
  FOREACH form_id IN ARRAY ARRAY['gansid-congress-2026', 'gansid-congress-2026-invite']
  LOOP
    SELECT fields INTO f FROM public.forms WHERE id = form_id;
    IF f IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(f) e WHERE e->>'id' = 'f_role'
    ) INTO has_role;

    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(f) e
      WHERE e->>'id' = 'f_city' AND COALESCE(e->>'section', '') = 'personal'
    ) INTO city_in_personal;

    -- Already patched
    IF has_role AND city_in_personal THEN
      CONTINUE;
    END IF;

    role_field := jsonb_build_object(
      'id', 'f_role',
      'type', 'text',
      'label', 'Role',
      'section', 'affiliation',
      'required', false,
      'placeholder', 'e.g. Physician, Researcher, Nurse, Patient advocate'
    );

    new_fields := '[]'::jsonb;
    len := jsonb_array_length(f);
    skip_affil_city := false;

    FOR i IN 0 .. len - 1 LOOP
      elem := f -> i;

      -- Drop legacy City from Affiliation & Role — re-insert after Country in personal
      IF elem->>'id' = 'f_city' AND COALESCE(elem->>'section', '') = 'affiliation' THEN
        skip_affil_city := true;
        CONTINUE;
      END IF;

      new_fields := new_fields || jsonb_build_array(elem);

      -- Institution → Role on the affiliation step
      IF elem->>'id' = 'f_org' AND NOT has_role THEN
        IF form_id = 'gansid-congress-2026' THEN
          role_field := jsonb_set(role_field, '{required}', 'false');
        END IF;
        new_fields := new_fields || jsonb_build_array(role_field);
      END IF;

      -- Personal Details: Country then City
      IF elem->>'id' = 'f_country' AND (skip_affil_city OR NOT city_in_personal) THEN
        city_field := jsonb_build_object(
          'id', 'f_city',
          'type', 'text',
          'label', 'City',
          'section', 'personal',
          'required', false
        );
        IF form_id = 'gansid-congress-2026-invite' THEN
          city_field := jsonb_set(city_field, '{required}', 'false');
        END IF;
        new_fields := new_fields || jsonb_build_array(city_field);
        city_in_personal := true;
      END IF;
    END LOOP;

    UPDATE public.forms SET fields = new_fields WHERE id = form_id;
  END LOOP;
END $$;
