-- Enables Postgres logical replication for `public.attendees` so the admin
-- dashboard can subscribe via supabase-js `channel().on('postgres_changes')`
-- and update the live attendee list the moment a check-in is stamped at the
-- door — no 5s polling delay, no manual page refresh.
--
-- Idempotent: the DO blocks check before adding so this can run on either
-- project (SCAGO + GANSID) regardless of prior publication state.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'attendees'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.attendees;
    END IF;
END $$;

-- REPLICA IDENTITY DEFAULT (PK-only) is enough for our subscription —
-- we re-fetch full rows by id when we receive an UPDATE event, so we
-- don't need FULL row payloads in the WAL stream.
ALTER TABLE public.attendees REPLICA IDENTITY DEFAULT;
