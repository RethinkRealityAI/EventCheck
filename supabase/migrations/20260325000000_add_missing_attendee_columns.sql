-- Add columns that the application code uses but were never added to the schema.
-- These are required for saveAttendee upsert to succeed.

ALTER TABLE public.attendees
ADD COLUMN IF NOT EXISTS form_title text null,
ADD COLUMN IF NOT EXISTS transaction_id text null,
ADD COLUMN IF NOT EXISTS payment_amount text null,
ADD COLUMN IF NOT EXISTS assigned_table_id uuid null,
ADD COLUMN IF NOT EXISTS assigned_seat integer null,
ADD COLUMN IF NOT EXISTS guest_type text null;
