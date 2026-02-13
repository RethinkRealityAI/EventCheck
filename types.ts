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
  donatedSeats?: number; // Number of extra seats donated for others
  dietaryPreferences?: string; // e.g. "Vegetarian", "Vegan", etc.
  primaryAttendeeId?: string; // If this is a guest, link to purchaser
  isPrimary?: boolean; // Defaults to true
  // Seating Assignment
  assignedTableId?: string | null;
  assignedSeat?: number | null;
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

export type FieldType = 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'address' | 'select' | 'radio' | 'checkbox' | 'boolean' | 'ticket';

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
}

export interface TicketConfig {
  currency: string;
  items: TicketItem[];
  promoCodes: PromoCode[];
  enableDonations?: boolean;
  enableGuestDetails?: boolean;
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
}

export interface Form {
  id: string;
  title: string;
  description: string;
  thankYouMessage?: string; // HTML supported
  fields: FormField[];
  createdAt: string;
  status: 'active' | 'draft' | 'closed';
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
  };
  pdfSettings?: Partial<PdfSettings>; // Per-form PDF overrides
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

  // Ticket Email
  emailHeaderLogo: string;
  emailHeaderColor: string;
  emailFooterColor: string;
  emailSubject: string;
  emailBodyTemplate: string; // HTML supported
  emailFooterText: string;

  // Invitation Email
  emailInvitationSubject: string;
  emailInvitationBody: string; // HTML supported

  // PDF Ticket
  pdfSettings: PdfSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  paypalClientId: '',
  currency: 'CAD',
  ticketPrice: 0,
  smtpHost: 'smtp.example.com',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',

  emailHeaderLogo: '',
  emailHeaderColor: '#f8fafc',
  emailFooterColor: '#f8fafc',
  emailSubject: 'Your Event Ticket & Invoice',
  emailBodyTemplate: '<p>Hi <strong>{{name}}</strong>,</p><p>Thank you for registering for <strong>{{event}}</strong>!</p><p>Attached is your official PDF ticket. Please present the QR code at the entrance.</p><p>Invoice ID: {{invoiceId}}<br>Amount Paid: {{amount}}</p><p>See you there!</p>',
  emailFooterText: '© 2025 Event Organizers Inc. All rights reserved.',

  emailInvitationSubject: 'You are invited!',
  emailInvitationBody: '<p>Hi there,</p><p>We would love for you to join us at <strong>{{event}}</strong>.</p><p>Please click the link below to register:</p><p><a href="{{link}}" style="color: #4F46E5;">Register Now</a></p><p>Best regards,<br>The Team</p>',

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