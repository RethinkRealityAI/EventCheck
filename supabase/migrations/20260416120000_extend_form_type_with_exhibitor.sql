ALTER TABLE public.forms DROP CONSTRAINT IF EXISTS forms_form_type_check;
ALTER TABLE public.forms ADD CONSTRAINT forms_form_type_check
  CHECK (form_type IN ('event', 'sponsor', 'exhibitor'));
