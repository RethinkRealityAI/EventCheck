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
  answers?: Record<string, any>; // Store custom form answers
  isTest?: boolean; // Flag to identify preview/test submissions
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
}

export interface TicketConfig {
  currency: string;
  items: TicketItem[];
  promoCodes: PromoCode[];
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
  };
}

export interface PdfSettings {
  enabled: boolean;
  logoUrl: string;
  organizationName: string;
  organizationInfo: string; // Tax ID, Address, etc.
  primaryColor: string;
  footerText: string;
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
  currency: 'USD',
  ticketPrice: 0,
  smtpHost: 'smtp.example.com',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  
  emailHeaderLogo: 'https://via.placeholder.com/300x80?text=Event+Logo',
  emailSubject: 'Your Event Ticket & Invoice',
  emailBodyTemplate: '<p>Hi <strong>{{name}}</strong>,</p><p>Thank you for registering for <strong>{{event}}</strong>!</p><p>Attached is your official PDF ticket. Please present the QR code at the entrance.</p><p>Invoice ID: {{invoiceId}}<br>Amount Paid: {{amount}}</p><p>See you there!</p>',
  emailFooterText: '© 2025 Event Organizers Inc. All rights reserved.',
  
  emailInvitationSubject: 'You are invited!',
  emailInvitationBody: '<p>Hi there,</p><p>We would love for you to join us at <strong>{{event}}</strong>.</p><p>Please click the link below to register:</p><p><a href="{{link}}" style="color: #4F46E5;">Register Now</a></p><p>Best regards,<br>The Team</p>',

  pdfSettings: {
    enabled: true,
    logoUrl: 'https://via.placeholder.com/150x50?text=LOGO',
    organizationName: 'Event Organizers Inc.',
    organizationInfo: '123 Event Street, City, Country\nTax ID: 12-3456789',
    primaryColor: '#4F46E5', // Indigo-600
    footerText: 'This ticket is non-transferable. Please bring a valid ID.'
  }
};