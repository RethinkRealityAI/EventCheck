-- Add donation and guest fields to attendees table

ALTER TABLE public.attendees
ADD COLUMN IF NOT EXISTS donation_amount numeric not null default 0,
ADD COLUMN IF NOT EXISTS donation_details jsonb null,
ADD COLUMN IF NOT EXISTS dietary_preferences text null,
ADD COLUMN IF NOT EXISTS primary_attendee_id uuid references public.attendees(id) on delete cascade,
ADD COLUMN IF NOT EXISTS is_primary boolean not null default true;

-- Update RLS if needed (existing policy is "Allow all", so no change needed)
