-- Allow the anon role to SELECT non-primary placeholder attendee rows so
-- PostgREST can execute the UPDATE in the guest claim flow.
--
-- PostgREST requires SELECT access before it will issue an UPDATE on a row;
-- without this policy the client-side .update() call silently returns 0 rows
-- even though the anon INSERT/UPDATE policies already exist.
--
-- We restrict the SELECT to unclaimed placeholder rows only (is_primary=false
-- + pending guest_type variants) so that anon cannot read any paid/primary
-- attendee data through this policy.

CREATE POLICY anon_can_read_placeholders ON public.attendees
  FOR SELECT
  TO anon
  USING (
    is_primary = false
    AND guest_type IN (
      'pending-claim',
      'exhibitor-staff-pending',
      'staff-pending'
    )
  );
