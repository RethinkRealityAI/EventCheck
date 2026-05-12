export interface Attendee {
  id: string; // Submission ID or Invoice ID
  formId: string; // Link to specific form
  formTitle: string; // Snapshot of form title
  name: string;
  email: string;
  ticketType: string; // Summary of tickets purchased
  registeredAt: string; // ISO Date string
  checkedInAt?: string | null; // ISO Date string or null
  qrPayload: string; // The signed/secure string inside the QR
  paymentStatus?: 'paid' | 'pending' | 'free';
  invoiceId?: string;
  transactionId?: string;
  paymentAmount?: string;
  answers?: Record<string, any>; // Store custom form answers
  isTest?: boolean; // Flag to identify preview/test submissions
  // Donation & Guest Fields
  donationType?: 'none' | 'table' | 'seats'; // What kind of donation was made
  donatedTables?: number; // Number of full tables donated
  donatedSeats?: number; // Number of extra seats donated for others
  dietaryPreferences?: string; // e.g. "Vegetarian", "Vegan", etc.
  primaryAttendeeId?: string; // If this is a guest, link to purchaser
  isPrimary?: boolean; // Defaults to true
  guestType?: 'adult' | 'child' | 'pending-claim' | 'claimed'
            | 'exhibitor-staff-pending' | 'exhibitor-staff-claimed'
            | 'staff-pending' | 'staff-claimed'; // Whether this guest is an adult or child (+ group-flow states)
  // Seating Assignment
  assignedTableId?: string | null;
  assignedSeat?: number | null;
  // Sponsor fields (populated only when this attendee is a sponsor submission)
  sponsorTier?: SponsorTier | null;
  sponsorItems?: SponsorItem[];
  paymentMethod?: PaymentMethod | null;
  companyInfo?: CompanyInfo;
  sponsoredAwards?: string[];
  adminNotes?: string;
  userId?: string | null;
  exhibitorBoothType?: string | null;
  /** Populated ONLY by dynamic-pricing submissions (group-mode or solo). Used
   *  as the discriminator between "group-mode primary with guests" (GANSID)
   *  and "static-ticket table purchaser with guest placeholder seats" (SCAGO).
   *  Null/undefined on static-ticket registrations. */
  pricingTemplateId?: string | null;
  /** Stamped whenever the ticket email is sent or re-sent. Surfaces on the
   *  dashboard as a "Ticket Sent" column so staff can see who's been
   *  notified vs. who still needs an email. Independent of registration
   *  state — `null` means we never sent (or we only sent before this field
   *  existed). */
  lastTicketEmailAt?: string | null;
}

export interface SeatingConfiguration {
  id: string;
  formId: string;
  name: string;
  createdAt: string;
}

export interface SeatingAssignment {
  id: string;
  configurationId: string;
  attendeeId: string;
  tableId: string;
  seatNumber: number;
}

export type SceneElementType = 'stage' | 'booth' | 'rect-table' | 'barrier' | 'plant' | 'column' | 'dance-floor' | 'bar' | 'custom';

export interface SceneElement {
  id: string;
  configurationId: string;
  elementType: SceneElementType;
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  createdAt: string;
  customModelId?: string; // References Custom3DModel.id for 'custom' type
}

export interface Custom3DModel {
  id: string;
  name: string;
  filePath: string;
  fileSize: number;
  thumbnailPath?: string;
  createdAt: string;
}

export interface SeatingTable {
  id: string;
  formId: string;
  configurationId?: string | null;
  name: string;
  capacity: number;
  shape: 'round' | 'rect';
  x: number;
  z: number;
  rotation: number;
  color?: string | null;
  vip: boolean;
  notes?: string | null;
  createdAt: string;
  // Computed client-side - not stored
  guests?: Attendee[];
}

export type ScanStatus = 'idle' | 'scanning' | 'success' | 'error' | 'already_checked_in';

export type FieldType = 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'address' | 'select' | 'radio' | 'checkbox' | 'boolean' | 'ticket' | 'country' | 'registration-mode-selector';

export interface PromoCode {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
}

export interface TicketItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  inventory: number; // 0 for unlimited
  maxPerOrder: number;
  seats?: number; // Number of seats this ticket represents (e.g. 8 for a table)
  itemCategory?: SponsorItemCategory;
  benefits?: string[];  // for tier cards — bulleted benefits list shown in the UI
}

export interface TicketConfig {
  currency: string;
  items: TicketItem[];
  promoCodes: PromoCode[];
  enableDonations?: boolean;
  enableGuestDetails?: boolean;
  enableAgeGroups?: boolean; // Ask if guests are adults or children
  // Donation Text Customization
  donationSectionTitle?: string;
  donationSectionDescription?: string;
  donationQuestionLabel?: string;
  donationHelpText?: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select, radio, checkbox
  ticketConfig?: TicketConfig; // Specific for ticket field
  conditional?: {
    enabled: boolean;
    fieldId: string;
    value: string;
  };
  validation?: 'string' | 'int';
  usedForPricing?: boolean;
  // registration-mode-selector specific
  groupEnabled?: boolean;
  groupMaxSize?: number;
  groupLabel?: string;
  individualLabel?: string;
  // consent-checkbox specific
  linkText?: string;
  consentModal?: {
    title: string;
    url: string;
  };
  // stepped-form specific
  section?: string;        // ID of the step this field belongs to
  sectionOrder?: number;   // Order within the step (falls back to field.order)
}

export interface Form {
  id: string;
  formType?: 'event' | 'sponsor' | 'exhibitor' | 'sponsor_exhibitor';  // defaults to 'event' when undefined
  title: string;
  description: string;
  thankYouMessage?: string; // HTML supported
  fields: FormField[];
  createdAt: string;
  status: 'active' | 'draft' | 'closed';
  showInPortal?: boolean;  // default false; controls portal dashboard visibility
  settings?: {
    ticketPrice?: number;
    currency?: string;
    showQrOnSuccess?: boolean;
    showTicketButtonOnSuccess?: boolean;
    successTitle?: string;
    successHeaderColor?: string;
    successFooterColor?: string;
    successIconColor?: string;
    // Form Visuals
    formHeaderColor?: string;
    formBackgroundColor?: string;
    formBackgroundImage?: string;
    formAccentColor?: string; // For buttons, etc.
    formTitleColor?: string;
    formDescriptionColor?: string;
    formTitle?: string; // Override the form title on the registration page
    submitButtonText?: string; // Customize submit button text
    transparentBackground?: boolean;
    cardBackgroundImage?: string;
    pricingTemplateId?: string | null;
    groupPath?: {
      enabled: boolean;
      maxSize: number;
    };
    sendGuestConfirmationEmails?: boolean;
    renderMode?: 'single' | 'stepped';
    steps?: FormStep[];
  };
  pdfSettings?: Partial<PdfSettings>; // Per-form PDF overrides
  pricingTemplate?: PricingTemplate; // Runtime-attached in getFormById; not persisted in DB
}

export interface PdfSettings {
  enabled: boolean;
  logoUrl: string;
  eventTitle?: string;
  organizationName: string;
  organizationInfo: string; // Tax ID, Address, etc.
  primaryColor: string;
  footerText: string;
  backgroundImage?: string; // Base64 of background image
}

export interface AppSettings {
  paypalClientId: string;
  currency: string;
  ticketPrice: number; // Legacy global backup
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  emailFromName: string; // Display name for the "From" line (e.g. "GANSID Congress")

  // Ticket Email
  emailHeaderLogo: string;
  emailHeaderColor: string;
  emailFooterColor: string;
  emailSubject: string;
  emailBodyTemplate: string; // HTML supported
  emailFooterText: string;

  // Table-Purchaser Email — sent to the buyer who picked a multi-seat
  // ticket (e.g. a full table of 8). Distinct from the standard ticket
  // confirmation because the copy typically references the included
  // guests, instructions for sharing claim links, table-host etiquette,
  // etc. Same placeholders as the standard ticket email.
  emailTablePurchaserSubject: string;
  emailTablePurchaserBody: string;

  // Guest Ticket Email (sent directly to named guests)
  emailGuestSubject: string;
  emailGuestBody: string;
  // Group-only email templates — distinct from the purchaser-guest "named guest" email above
  // Template Y: pending-claim guests (claim link + payment context). Placeholders: {{event}}, {{purchaser}}, {{name}}, {{complete_url}}, {{signup_url}}.
  emailGuestClaimSubject: string;
  emailGuestClaimBody: string;
  // Template X: inline-completed guests (ticket ready). Same placeholders as Y minus complete_url; adds {{signup_url}}.
  emailGuestConfirmedSubject: string;
  emailGuestConfirmedBody: string;
  // Purchaser backup note (appended when guest tickets are included)
  emailPurchaserGuestNote: string;

  // Invitation Email
  emailInvitationSubject: string;
  emailInvitationBody: string; // HTML supported

  // "Complete your registration" reminder — admins send from the Signups tab to
  // nudge portal users who signed up but haven't completed their registration.
  // Placeholders: {{name}}, {{event}}, {{resume_url}}, {{signup_url}}, {{step}}, {{total_steps}}.
  emailReminderSubject: string;
  emailReminderBody: string; // HTML supported

  // Staff Email Templates (sponsor_exhibitor form staff invitations/confirmations)
  emailStaffInviteSubject?: string;
  emailStaffInviteBody?: string;
  emailStaffConfirmedSubject?: string;
  emailStaffConfirmedBody?: string;

  // Sponsor Email Templates
  sponsorInvitationSubject: string;
  sponsorInvitationBody: string;
  sponsorConfirmationPaidSubject: string;
  sponsorConfirmationPaidBody: string;
  sponsorChequePledgeSubject: string;
  sponsorChequePledgeBody: string;
  sponsorChequeInternalSubject: string;
  sponsorChequeInternalBody: string;
  sponsorChequeInternalRecipients: string[];
  sponsorChequeReceivedSubject: string;
  sponsorChequeReceivedBody: string;
  sponsorChequeMailingAddress: string;
  sponsorHstRate: number;

  // PDF Ticket
  pdfSettings: PdfSettings;

  // Dashboard Preferences
  defaultDashboardFormId?: string;
  dashboardColumnPrefs?: Record<string, Record<string, boolean>>;
  /** Per-deployment attendee-list tab layout. `order` is the admin-chosen
   *  tab order (ids); `hidden` is the admin-hidden subset. Conditional tabs
   *  (exhibitors, signups) still respect their own site-availability gates —
   *  admins can't force-show a tab that has no data. */
  dashboardTabPrefs?: { order?: string[]; hidden?: string[] };

  // Feature flags
  feature_pricing_templates?: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  paypalClientId: '',
  currency: 'CAD',
  ticketPrice: 0,
  smtpHost: 'smtp.example.com',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  emailFromName: '',

  emailHeaderLogo: '',
  emailHeaderColor: '#f8fafc',
  emailFooterColor: '#f8fafc',
  emailSubject: 'Your ticket for {{event}}',
  emailBodyTemplate: '<p>Hi <strong>{{name}}</strong>,</p><p>Thank you for registering for <strong>{{event}}</strong>!</p><p>Attached is your official PDF ticket. Please present the QR code at the entrance.</p><p>Invoice ID: {{invoiceId}}<br>Amount Paid: {{amount}}</p><p>See you there!</p>',
  emailFooterText: '© 2025 Event Organizers Inc. All rights reserved.',

  emailTablePurchaserSubject: 'Your table at {{event}}',
  emailTablePurchaserBody: '<p>Hi <strong>{{name}}</strong>,</p><p>Thank you for purchasing a table at <strong>{{event}}</strong>! Your table comes with seats for you and your guests.</p><p>Your own ticket is attached as a PDF — please present the QR code at the entrance.</p><p>Each guest seat has been pre-created. We will email guest claim links separately so each person can fill in their own details (name, dietary preferences, etc.). You can also share the links yourself from your portal account.</p><p>Invoice ID: {{invoiceId}}<br>Amount Paid: {{amount}}</p><p>See you there!</p>',

  emailGuestSubject: 'Your Ticket for {{event}}',
  emailGuestBody: 'Great news! {{purchaser}} has registered you for {{event}}. Your ticket is attached — please bring it with you to the event. You can scan the QR code on your ticket for entry.',
  emailPurchaserGuestNote: "We've also included your guest tickets as a backup. Named guests will receive their own ticket by email directly. For any unnamed guests, you can forward their ticket or share the registration link on it so they can provide their details.",

  // Group Template Y — pending-claim (needs to complete their own details)
  emailGuestClaimSubject: 'Complete your registration for {{event}}',
  emailGuestClaimBody: '<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has purchased your ticket for <strong>{{event}}</strong>. Your ticket is attached and will be fully confirmed once you complete a few personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account with this same email so you can view your ticket and updates anytime: <a href="{{signup_url}}">{{signup_url}}</a></p><p>See you at the Congress!</p>',

  // Group Template X — inline completed (ticket ready, no further action required)
  emailGuestConfirmedSubject: 'Your ticket for {{event}} is confirmed',
  emailGuestConfirmedBody: '<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered you for <strong>{{event}}</strong> and has already provided your details — you are all set. Your ticket is attached; please present the QR code at the entrance.</p><p>If you would like to create a portal account with this email address to view your ticket or get updates anytime, you can do so here: <a href="{{signup_url}}">{{signup_url}}</a></p><p>See you at the Congress!</p>',

  emailInvitationSubject: 'You are invited!',
  emailInvitationBody: '<p>Hi there,</p><p>We would love for you to join us at <strong>{{event}}</strong>.</p><p>Please click the link below to register:</p><p><a href="{{link}}" style="color: #4F46E5;">Register Now</a></p><p>Best regards,<br>The Team</p>',

  emailReminderSubject: 'Complete your registration for {{event}}',
  emailReminderBody: '<p>Hi {{name}},</p><p>Just a friendly reminder — your registration for <strong>{{event}}</strong> isn\u2019t complete yet. You left off at step {{step}} of {{total_steps}}.</p><p style="text-align:center;margin:24px 0;"><a href="{{resume_url}}" style="display:inline-block;padding:12px 24px;background:#ba0028;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Resume my registration</a></p><p>Prefer to start fresh? Sign in here: <a href="{{signup_url}}">{{signup_url}}</a></p><p>We look forward to seeing you at the Congress.</p>',

  defaultDashboardFormId: undefined,
  dashboardColumnPrefs: {},

  sponsorInvitationSubject: 'Invitation to Partner with SCAGO at the Hope Gala & Awards 2026',
  sponsorInvitationBody: '<p>Dear {{contactName}},</p><p>On behalf of the Sickle Cell Awareness Group of Ontario, I am writing to invite <strong>{{orgName}}</strong> to partner with us at the <strong>{{event}}</strong> on <strong>{{eventDate}}</strong>.</p><p>You can review our sponsorship packages and confirm your preferred level of support using the form below:</p><p><a href="{{sponsorFormLink}}" style="display:inline-block;padding:12px 24px;background:#C8262A;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">View Sponsorship Options</a></p><p>We kindly ask that confirmations be received by <strong>March 31, 2026</strong> to support timely planning.</p><p>Thank you for considering this partnership.</p><p>Warm regards,<br>SCAGO Team</p>',
  sponsorConfirmationPaidSubject: 'Thank you for your sponsorship — {{event}}',
  sponsorConfirmationPaidBody: '<p>Dear {{contactName}},</p><p>Thank you for confirming <strong>{{orgName}}</strong> as a partner at the {{event}}. We are honoured to have your support.</p><p><strong>Your sponsorship includes:</strong></p>{{itemsList}}<p><strong>Total paid:</strong> {{total}}<br><strong>Transaction ID:</strong> {{transactionId}}</p><p>Attached you will find your official receipt and event tickets (if applicable). {{guestClaimLinks}}We will be in touch shortly regarding logo artwork and additional partnership details.</p><p>With gratitude,<br>SCAGO Team</p>',
  sponsorChequePledgeSubject: 'Sponsorship pledge received — {{event}}',
  sponsorChequePledgeBody: '<p>Dear {{contactName}},</p><p>Thank you for pledging to support <strong>{{orgName}}</strong> at the {{event}}. Your selections have been recorded.</p><p><strong>Your selections:</strong></p>{{itemsList}}<p><strong>Total due:</strong> {{total}}</p><p><strong>Please mail your cheque to:</strong></p><p>{{mailingAddress}}</p><p>Once the cheque is received, we will send your official receipt and event tickets (if applicable). Attached please find a preliminary pending-payment receipt for your records.</p><p>With gratitude,<br>SCAGO Team</p>',
  sponsorChequeInternalSubject: 'Cheque payment request — {{orgName}} — {{total}}',
  sponsorChequeInternalBody: '<p><strong>A new cheque sponsorship pledge has been submitted. Please follow up with the sponsor.</strong></p><p><strong>Organization:</strong> {{orgName}}<br><strong>Contact:</strong> {{contactName}}<br><strong>Email:</strong> {{contactEmail}}<br><strong>Phone:</strong> {{contactPhone}}</p><p><strong>Selections:</strong></p>{{itemsList}}<p><strong>Total due:</strong> {{total}}</p><p><a href="{{adminDashboardLink}}">Open in admin dashboard</a></p>',
  sponsorChequeInternalRecipients: ['gala@sicklecellanemia.ca', 'sicklecellawarenessontario@gmail.com', 'communication@sicklecellanemia.ca'],
  sponsorChequeReceivedSubject: 'Payment received — thank you! ({{event}})',
  sponsorChequeReceivedBody: '<p>Dear {{contactName}},</p><p>We are pleased to confirm that we have received your cheque payment for <strong>{{orgName}}</strong>\'s sponsorship of the {{event}}.</p><p><strong>Your confirmed sponsorship:</strong></p>{{itemsList}}<p><strong>Total paid:</strong> {{total}}</p><p>Attached you will find your final receipt and event tickets (if applicable).</p><p>With gratitude,<br>SCAGO Team</p>',
  sponsorChequeMailingAddress: 'Sickle Cell Awareness Group of Ontario\n5109 Steeles Ave W #330\nNorth York, ON M9L 2Y8\n\nPayable to: "Sickle Cell Awareness Group of Ontario"',
  sponsorHstRate: 0.13,

  pdfSettings: {
    enabled: true,
    logoUrl: '',
    eventTitle: '',
    organizationName: 'Event Organizers Inc.',
    organizationInfo: '123 Event Street, City, Country\nTax ID: 12-3456789',
    primaryColor: '#4F46E5', // Indigo-600
    footerText: 'This ticket is non-transferable. Please bring a valid ID.'
  }
};

// ============================================================
// Sponsor Management
// ============================================================

export type SponsorTier = 'signature' | 'gold' | 'silver' | 'award' | 'scholarship';
export type SponsorItemCategory = 'package' | 'scholarship' | 'ad' | 'booth';
export type PaymentMethod = 'card' | 'paypal' | 'cheque' | 'external';
export type SponsorProspectStatus = 'prospect' | 'invited' | 'responded' | 'confirmed' | 'declined';

export interface SponsorItem {
  type: SponsorItemCategory;
  key: string;       // stable identifier e.g. 'tier-gold', 'ad-back-page'
  label: string;     // display label e.g. 'Gold Sponsorship'
  qty: number;
  unitPrice: number;
  subtotal: number;
}

export interface CompanyInfo {
  orgName: string;
  contactName?: string;
  contactTitle?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  logoUrl?: string;
}

export interface SponsorProspectEmailLog {
  sentAt: string;     // ISO date
  subject: string;
  templateKey: string;
  recipientEmail: string;
}

export interface SponsorProspect {
  id: string;
  orgName: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail: string;
  contactPhone?: string;
  status: SponsorProspectStatus;
  sponsorFormId?: string | null;
  invitedAt?: string | null;
  lastEmailedAt?: string | null;
  emailHistory: SponsorProspectEmailLog[];
  notes?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Dynamic Pricing Engine
// ---------------------------------------------------------------------------

export interface PricingTier {
  id: string;
  name: string;
  label: string;
  countries: string[];
}

export interface DateBracket {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface PricingCategory {
  id: string;
  name: string;
  prices: Record<string, Record<string, number>>;
}

export interface PricingAddon {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface PricingTemplate {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  tiers: PricingTier[];
  dateBrackets: DateBracket[];
  activeBracketOverride: string | null;
  categories: PricingCategory[];
  addons: PricingAddon[];
  createdAt: string;
  updatedAt: string;
}

export interface DynamicPricingSelection {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
  expectedTotal: number;
}

export interface GroupMemberPricingSelection {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
}

// ============================================================
// User Portal
// ============================================================

export type UserRole = 'attendee' | 'exhibitor' | 'sponsor' | 'admin' | 'super_admin';

/**
 * Per-admin page-level permissions, stored on profiles.admin_permissions.
 * NULL / undefined for non-admins and super_admins; super_admin access is
 * implicit-all. The canonical shape lives in utils/adminPermissions.ts.
 */
export interface AdminPermissions {
  pages: {
    dashboard: boolean;
    forms: boolean;
    sponsors: boolean;
    seating: boolean;
    generateQr: boolean;
    settings: boolean;
  };
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organization: string | null;
  countryCode: string | null;
  phone: string | null;
  avatarUrl: string | null;
  adminPermissions: AdminPermissions | null;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  site: 'scago' | 'gansid';
  title: string;
  body: string | null;
  imageUrl: string | null;
  isActive: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormStep {
  id: string;
  label: string;
  description?: string;
}