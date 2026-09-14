// scripts/qa/fixtures.mjs
//
// Fixture data for the mock-mode QA run: a GANSID-shaped tenant with the
// exact mix the unified dashboard exists for — ordinary registrants, a group,
// a free BOGO guest, a speaker, a sponsor booking with its delegation
// (claimed, pending and inline-complete seats), an exhibitor booking with
// booth staff, portal signups at every registration stage, and one form-
// preview test row that must stay out of every count.
//
// Row shapes are the DATABASE shapes (snake_case) because the mock serves
// PostgREST; the app maps them the same way it maps production rows.

const NOW = Date.now();
const iso = (hoursAgo) => new Date(NOW - hoursAgo * 3600 * 1000).toISOString();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const QA_INBOX = process.env.QA_TEST_INBOX || 'qa@example.test';
const plus = (tag) => {
  const [local, domain] = QA_INBOX.split('@');
  return `${local}+${tag}@${domain}`;
};

export const ADMIN_USER = {
  id: uuid(1),
  email: 'qa-admin@example.test',
  full_name: 'QA Admin',
  role: 'super_admin',
};

export const FORMS = [
  {
    id: 'gansid-congress-2026',
    title: 'GANSID Congress 2026',
    description: 'Main registration',
    status: 'active',
    form_type: 'event',
    show_in_portal: true,
    created_at: iso(24 * 90),
    thank_you_message: null,
    fields: [
      { id: 'f_name', type: 'text', label: 'Full Name', required: true },
      { id: 'f_email', type: 'email', label: 'Email Address', required: true },
      { id: 'f_country', type: 'country', label: 'Country', required: true },
      { id: 'f_role', type: 'select', label: 'Professional role', options: ['Physician', 'Nurse', 'Researcher', 'Patient advocate'] },
    ],
    settings: { renderMode: 'stepped', steps: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }], currency: 'USD' },
  },
  {
    id: 'gansid-congress-2026-staff',
    title: 'GANSID Congress 2026 — Staff Registration',
    description: 'Sponsor / exhibitor staff details',
    status: 'active',
    form_type: 'event',
    show_in_portal: false,
    created_at: iso(24 * 80),
    thank_you_message: null,
    fields: [
      { id: 'f_name', type: 'text', label: 'Full Name', required: true },
      { id: 'f_email', type: 'email', label: 'Email Address', required: true },
    ],
    settings: {},
  },
  {
    id: 'gansid-sponsor-exhibitor',
    title: 'GANSID 2026 — Sponsor & Exhibitor Registration',
    description: 'Organizations',
    status: 'active',
    form_type: 'sponsor_exhibitor',
    show_in_portal: true,
    created_at: iso(24 * 80),
    thank_you_message: null,
    fields: [],
    settings: { staffFormId: 'gansid-congress-2026-staff' },
  },
];

const base = (over) => ({
  form_title: null,
  checked_in_at: null,
  qr_payload: JSON.stringify({ id: over.id }),
  payment_status: 'paid',
  invoice_id: null,
  transaction_id: null,
  payment_amount: null,
  answers: {},
  is_test: false,
  donation_amount: 0,
  donation_details: null,
  dietary_preferences: null,
  primary_attendee_id: null,
  is_primary: true,
  assigned_table_id: null,
  assigned_seat: null,
  guest_type: null,
  sponsor_tier: null,
  sponsor_items: [],
  payment_method: 'paypal',
  company_info: null,
  sponsored_awards: [],
  admin_notes: null,
  user_id: null,
  exhibitor_booth_type: null,
  last_ticket_email_at: null,
  is_paid_extra: false,
  is_donated_seat_claim: false,
  is_bogo_claim: false,
  bogo_source_attendee_id: null,
  bogo_dismissed_by_payer_at: null,
  applied_promo_code: null,
  attendee_category: null,
  pricing_template_id: null,
  pricing_tier: null,
  pricing_bracket: null,
  pricing_category_id: null,
  ...over,
});

const CONGRESS = 'gansid-congress-2026';
const STAFF = 'gansid-congress-2026-staff';
const ORG_FORM = 'gansid-sponsor-exhibitor';

export const ATTENDEES = [
  // ── Ordinary registrants ──
  base({ id: uuid(100), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Grace Mensah', email: plus('grace'), ticket_type: 'Physician — Regular', registered_at: iso(3), user_id: uuid(1001), answers: { f_country: 'GH', f_role: 'Physician' }, checked_in_at: iso(1), payment_amount: '150.00 USD', pricing_template_id: 'tpl', pricing_tier: 'tier2', pricing_bracket: 'regular', pricing_category_id: 'physician' }),
  base({ id: uuid(101), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Ravi Iyer', email: plus('ravi'), ticket_type: 'Researcher — Regular', registered_at: iso(30), user_id: uuid(1002), answers: { f_country: 'IN', f_role: 'Researcher' }, payment_amount: '150.00 USD', pricing_template_id: 'tpl', pricing_tier: 'tier2', pricing_bracket: 'regular', pricing_category_id: 'physician' }),
  base({ id: uuid(102), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Priya Iyer', email: plus('priya'), ticket_type: 'Nurse — Regular', registered_at: iso(30), primary_attendee_id: uuid(101), is_primary: false, guest_type: 'claimed', answers: { f_country: 'IN', f_role: 'Nurse' }, payment_amount: '100.00 USD' }),
  base({ id: uuid(103), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Amaka Obi', email: plus('amaka'), ticket_type: 'Free guest', registered_at: iso(28), payment_status: 'free', payment_method: 'bogo', is_bogo_claim: true, bogo_source_attendee_id: uuid(100), answers: { _guest_country: 'NG' }, payment_amount: '0' }),
  base({ id: uuid(104), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Dr. Lena Fischer', email: plus('lena'), ticket_type: 'Speaker', registered_at: iso(60), payment_status: 'free', payment_method: 'promo', guest_type: 'speaker', attendee_category: 'speaker', applied_promo_code: 'SPEAKER2026', answers: { f_country: 'DE', f_role: 'Physician' }, payment_amount: '0' }),
  base({ id: uuid(105), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Kofi Boateng', email: plus('kofi'), ticket_type: 'Patient advocate — Regular', registered_at: iso(72), payment_status: 'pending', payment_method: 'flutterwave', answers: { f_country: 'GH', f_role: 'Patient advocate' }, user_id: uuid(1003) }),
  base({ id: uuid(106), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Samuel Okafor', email: plus('samuel'), ticket_type: 'Physician — Regular', registered_at: iso(100), answers: { f_country: 'NG', f_role: 'Physician' }, payment_amount: '150.00 USD', checked_in_at: iso(2) }),

  // ── Pfizer: sponsor booking + delegation (the reported case) ──
  base({
    id: uuid(200), form_id: ORG_FORM, form_title: 'GANSID 2026 — Sponsor & Exhibitor Registration',
    name: 'Pfizer, Inc [Sponsor]', email: plus('pfizer-org'), ticket_type: 'Sponsor', registered_at: iso(120),
    payment_method: 'external', payment_amount: 'PAID EXTERNALLY', sponsor_tier: 'gold', user_id: uuid(1010),
    sponsor_items: [{ key: 'gold', type: 'package', label: 'Gold Sponsorship', qty: 1, subtotal: 25000 }],
    company_info: { orgName: 'Pfizer, Inc', contactName: 'Dana Osei', contactEmail: plus('pfizer-org') },
  }),
  base({ id: uuid(201), form_id: STAFF, form_title: 'GANSID Congress 2026 — Staff Registration', name: 'Amara Bello', email: plus('amara'), ticket_type: 'Full Congress', registered_at: iso(119), primary_attendee_id: uuid(200), is_primary: false, guest_type: 'staff-claimed', payment_method: 'external', payment_amount: 'PAID EXTERNALLY', answers: { staffCategory: 'full_access' }, user_id: uuid(1011), checked_in_at: iso(1) }),
  base({ id: uuid(202), form_id: STAFF, form_title: 'GANSID Congress 2026 — Staff Registration', name: 'Chen Wei', email: plus('chen'), ticket_type: 'Full Congress', registered_at: iso(119), primary_attendee_id: uuid(200), is_primary: false, guest_type: null, payment_method: 'external', payment_amount: 'PAID EXTERNALLY', answers: { staffCategory: 'full_access' } }),
  base({ id: uuid(203), form_id: STAFF, form_title: 'GANSID Congress 2026 — Staff Registration', name: 'Pfizer, Inc — Staff slot #3', email: '', ticket_type: 'Hall Only', registered_at: iso(119), primary_attendee_id: uuid(200), is_primary: false, guest_type: 'staff-pending', payment_method: 'external', payment_amount: 'PAID EXTERNALLY', answers: { staffCategory: 'hall_only' } }),
  base({ id: uuid(204), form_id: STAFF, form_title: 'GANSID Congress 2026 — Staff Registration', name: 'Tomás Rivera', email: plus('tomas'), ticket_type: 'Hall Only (Extra)', registered_at: iso(118), primary_attendee_id: uuid(200), is_primary: false, guest_type: 'staff-pending', payment_method: 'paypal', payment_amount: '$50.00 USD', is_paid_extra: true, answers: { staffCategory: 'hall_only' } }),

  // ── Novo Nordisk: exhibitor booking + booth staff ──
  base({
    id: uuid(300), form_id: ORG_FORM, form_title: 'GANSID 2026 — Sponsor & Exhibitor Registration',
    name: 'Novo Nordisk [Exhibitor]', email: plus('novo-org'), ticket_type: 'Exhibitor', registered_at: iso(150),
    payment_method: 'external', payment_amount: 'PAID EXTERNALLY', exhibitor_booth_type: 'booth_3x3_corner',
    company_info: { orgName: 'Novo Nordisk', contactName: 'Lars Holm' },
  }),
  base({ id: uuid(301), form_id: STAFF, form_title: 'GANSID Congress 2026 — Staff Registration', name: 'Lars Holm', email: plus('lars'), ticket_type: 'Full Congress', registered_at: iso(149), primary_attendee_id: uuid(300), is_primary: false, guest_type: 'staff-claimed', payment_method: 'external', payment_amount: 'PAID EXTERNALLY', answers: { staffCategory: 'full_access' } }),
  base({ id: uuid(302), form_id: STAFF, form_title: 'GANSID Congress 2026 — Staff Registration', name: 'Ines Duarte', email: plus('ines'), ticket_type: 'Hall Only', registered_at: iso(149), primary_attendee_id: uuid(300), is_primary: false, guest_type: 'staff-pending', payment_method: 'external', payment_amount: 'PAID EXTERNALLY', answers: { staffCategory: 'hall_only' } }),

  // ── Form-preview test row: must never leak into Live or the stats ──
  base({ id: uuid(900), form_id: CONGRESS, form_title: 'GANSID Congress 2026', name: 'Preview Submission', email: plus('preview'), ticket_type: 'Physician — Regular', registered_at: iso(0.5), is_test: true }),
];

export const PROFILES = [
  { id: ADMIN_USER.id, email: ADMIN_USER.email, full_name: ADMIN_USER.full_name, role: 'super_admin', organization: null, country_code: null, phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 200), updated_at: iso(24 * 200) },
  { id: uuid(1001), email: plus('grace'), full_name: 'Grace Mensah', role: 'attendee', organization: null, country_code: 'GH', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 10), updated_at: iso(3) },
  { id: uuid(1002), email: plus('ravi'), full_name: 'Ravi Iyer', role: 'attendee', organization: null, country_code: 'IN', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 12), updated_at: iso(30) },
  { id: uuid(1003), email: plus('kofi'), full_name: 'Kofi Boateng', role: 'attendee', organization: null, country_code: 'GH', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 4), updated_at: iso(72) },
  { id: uuid(1004), email: plus('yara'), full_name: 'Yara Haddad', role: 'attendee', organization: null, country_code: 'LB', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 3), updated_at: iso(20) },
  { id: uuid(1005), email: plus('mateo'), full_name: 'Mateo Silva', role: 'attendee', organization: null, country_code: 'BR', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 2), updated_at: iso(10) },
  { id: uuid(1006), email: plus('noor'), full_name: 'Noor Rahman', role: 'attendee', organization: null, country_code: 'BD', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 1), updated_at: iso(6) },
  { id: uuid(1007), email: plus('elif'), full_name: '', role: 'attendee', organization: null, country_code: null, phone: null, avatar_url: null, admin_permissions: null, created_at: iso(5), updated_at: iso(5) },
  { id: uuid(1010), email: plus('pfizer-org'), full_name: 'Dana Osei', role: 'sponsor', organization: 'Pfizer, Inc', country_code: 'US', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 30), updated_at: iso(120) },
  { id: uuid(1011), email: plus('amara'), full_name: 'Amara Bello', role: 'attendee', organization: 'Pfizer, Inc', country_code: 'NG', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 20), updated_at: iso(119) },
  { id: uuid(1012), email: plus('hemex'), full_name: 'Rita Nair', role: 'exhibitor', organization: 'Hemex Health', country_code: 'IN', phone: null, avatar_url: null, admin_permissions: null, created_at: iso(24 * 6), updated_at: iso(24 * 6) },
];

export const REGISTRATION_DRAFTS = [
  { id: uuid(2001), user_id: uuid(1004), form_id: CONGRESS, state: { currentIndex: 1, answers: { f_name: 'Yara Haddad' } }, created_at: iso(22), updated_at: iso(20) },
  { id: uuid(2002), user_id: uuid(1005), form_id: CONGRESS, state: { currentIndex: 3, answers: {} }, created_at: iso(12), updated_at: iso(10) },
];

export const APP_SETTINGS = {
  id: 1,
  paypal_client_id: '',
  currency: 'USD',
  ticket_price: 0,
  smtp_host: 'smtp.resend.com',
  smtp_port: '587',
  smtp_user: 'resend',
  smtp_pass: '',
  email_from_name: 'GANSID Congress',
  email_header_logo: '',
  email_header_color: '#f8fafc',
  email_footer_color: '#f8fafc',
  email_subject: 'Your ticket for {{event}}',
  email_body_template: '<p>Hi {{name}}, your ticket is attached.</p>',
  email_footer_text: '',
  email_guest_subject: null,
  email_guest_body: null,
  email_purchaser_guest_note: null,
  email_invitation_subject: null,
  email_invitation_body: null,
  pdf_settings: null,
  default_dashboard_form_id: null,
  dashboard_column_prefs: {},
  dashboard_tab_prefs: null,
  feature_pricing_templates: true,
};

export const EMAIL_SENDS = [
  { id: uuid(3001), tracking_id: 'trk-1', recipient_email: plus('yara'), recipient_user_id: uuid(1004), recipient_attendee_id: null, subject: 'Complete your registration for GANSID Congress 2026', template_key: 'reminder', form_id: CONGRESS, event_name: 'GANSID Congress 2026', sent_at: iso(18), sent_by: ADMIN_USER.id, opened_at: iso(17), click_count: 1, last_clicked_at: iso(17), metadata: {} },
];

/** Every table the dashboard may read, keyed by name. Unknown tables serve []. */
export function buildTables() {
  return {
    forms: FORMS.map(f => ({ ...f })),
    attendees: ATTENDEES.map(a => ({ ...a })),
    profiles: PROFILES.map(p => ({ ...p })),
    registration_drafts: REGISTRATION_DRAFTS.map(d => ({ ...d })),
    app_settings: [{ ...APP_SETTINGS }],
    email_sends: EMAIL_SENDS.map(e => ({ ...e })),
    email_failures: [],
    sponsor_prospects: [],
    pricing_templates: [],
    seating_configurations: [],
    seating_tables: [],
    seating_assignments: [],
    scene_elements: [],
    custom_3d_models: [],
    imported_contacts: [],
    import_batches: [],
    announcements: [],
    site_content: [],
  };
}
