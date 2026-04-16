import { Attendee, Form, AppSettings, DEFAULT_SETTINGS, FormField, PdfSettings, SeatingTable, SeatingConfiguration, SeatingAssignment, SceneElement, SceneElementType, Custom3DModel, SponsorProspect, SponsorProspectStatus, PricingTemplate } from '../types';
import { supabase } from './supabaseClient';
import { Database } from './database.types';

type AttendeeRow = Database['public']['Tables']['attendees']['Row'];
type AttendeeInsert = Database['public']['Tables']['attendees']['Insert'];
type FormRow = Database['public']['Tables']['forms']['Row'];
type FormInsert = Database['public']['Tables']['forms']['Insert'];
type AppSettingsRow = Database['public']['Tables']['app_settings']['Row'];

type SeatingConfigurationRow = Database['public']['Tables']['seating_configurations']['Row'];
type SeatingConfigurationInsert = Database['public']['Tables']['seating_configurations']['Insert'];
type SeatingAssignmentRow = Database['public']['Tables']['seating_assignments']['Row'];
type SeatingAssignmentInsert = Database['public']['Tables']['seating_assignments']['Insert'];

type SceneElementRow = Database['public']['Tables']['scene_elements']['Row'];
type SceneElementInsert = Database['public']['Tables']['scene_elements']['Insert'];

type Custom3DModelRow = Database['public']['Tables']['custom_3d_models']['Row'];
type Custom3DModelInsert = Database['public']['Tables']['custom_3d_models']['Insert'];

// --- Attendees ---
export const getAttendees = async (): Promise<Attendee[]> => {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .order('registered_at', { ascending: false });

  if (error) {
    console.error("Failed to load attendees", error);
    return [];
  }

  return (data || []).map(mapAttendeeFromDb);
};

export const getAttendeesByForm = async (formId: string): Promise<Attendee[]> => {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .eq('form_id', formId)
    .order('registered_at', { ascending: false });

  if (error) {
    console.error("Failed to load attendees by form", error);
    return [];
  }

  return (data || []).map(mapAttendeeFromDb);
};

export const saveAttendee = async (attendee: Attendee): Promise<void> => {
  const dbRecord = mapAttendeeToDb(attendee);
  const { error } = await supabase
    .from('attendees')
    .upsert(dbRecord);

  if (error) {
    console.error("Failed to save attendee", error);
    throw new Error(`Failed to save attendee: ${error.message}`);
  }
};

export const updateAttendee = async (id: string, updates: Partial<Attendee>): Promise<void> => {
  const dbUpdates: Database['public']['Tables']['attendees']['Update'] = {};

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.ticketType !== undefined) dbUpdates.ticket_type = updates.ticketType;
  if (updates.paymentStatus !== undefined) dbUpdates.payment_status = updates.paymentStatus;
  if (updates.checkedInAt !== undefined) dbUpdates.checked_in_at = updates.checkedInAt;

  // Add other fields if needed, kept targeted for now
  if (updates.formId !== undefined) dbUpdates.form_id = updates.formId;
  if (updates.formTitle !== undefined) dbUpdates.form_title = updates.formTitle;
  if (updates.qrPayload !== undefined) dbUpdates.qr_payload = updates.qrPayload;
  if (updates.invoiceId !== undefined) dbUpdates.invoice_id = updates.invoiceId;
  if (updates.transactionId !== undefined) dbUpdates.transaction_id = updates.transactionId;
  if (updates.paymentAmount !== undefined) dbUpdates.payment_amount = updates.paymentAmount;
  if (updates.isTest !== undefined) dbUpdates.is_test = updates.isTest;
  if (updates.answers !== undefined) dbUpdates.answers = updates.answers;
  if (updates.donatedSeats !== undefined) dbUpdates.donation_amount = updates.donatedSeats;
  if (updates.donationType !== undefined || updates.donatedTables !== undefined) {
    dbUpdates.donation_details = { donationType: updates.donationType || 'none', donatedTables: updates.donatedTables || 0 } as any;
  }
  if (updates.dietaryPreferences !== undefined) dbUpdates.dietary_preferences = updates.dietaryPreferences;
  if (updates.primaryAttendeeId !== undefined) dbUpdates.primary_attendee_id = updates.primaryAttendeeId;
  if (updates.isPrimary !== undefined) dbUpdates.is_primary = updates.isPrimary;
  if (updates.assignedTableId !== undefined) dbUpdates.assigned_table_id = updates.assignedTableId;
  if (updates.assignedSeat !== undefined) dbUpdates.assigned_seat = updates.assignedSeat;
  if (updates.guestType !== undefined) dbUpdates.guest_type = updates.guestType || null;
  if (updates.sponsorTier !== undefined) dbUpdates.sponsor_tier = updates.sponsorTier || null;
  if (updates.sponsorItems !== undefined) dbUpdates.sponsor_items = updates.sponsorItems as any;
  if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod || null;
  if (updates.companyInfo !== undefined) dbUpdates.company_info = updates.companyInfo as any;
  if (updates.sponsoredAwards !== undefined) dbUpdates.sponsored_awards = updates.sponsoredAwards as any;
  if (updates.adminNotes !== undefined) dbUpdates.admin_notes = updates.adminNotes ?? null;

  const { error } = await supabase
    .from('attendees')
    .update(dbUpdates)
    .eq('id', id);

  if (error) console.error("Failed to update attendee", error);
};

export const deleteAttendee = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('attendees')
    .delete()
    .eq('id', id);

  if (error) console.error("Failed to delete attendee", error);
};

export const checkInAttendee = async (id: string): Promise<{ attendee: Attendee, alreadyCheckedIn: boolean } | null> => {
  const { data: existing, error: fetchError } = await supabase
    .from('attendees')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) return null;
  if (existing.checked_in_at) {
    return { attendee: mapAttendeeFromDb(existing), alreadyCheckedIn: true };
  }

  const { data: updated, error: updateError } = await supabase
    .from('attendees')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error("Failed to check in", updateError);
    return null;
  }

  return { attendee: mapAttendeeFromDb(updated), alreadyCheckedIn: false };
};

// --- Forms ---
export const getForms = async (): Promise<Form[]> => {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Failed to load forms", error);
    return [];
  }

  if (data?.length === 0) {
    const defaultForm: Form = {
      id: crypto.randomUUID(),
      title: 'General Event Registration',
      description: 'Please fill out your details to register.',
      createdAt: new Date().toISOString(),
      status: 'active',
      fields: [
        { id: 'f_name', type: 'text', label: 'Full Name', required: true },
        { id: 'f_email', type: 'email', label: 'Email Address', required: true }
      ]
    };
    await saveForm(defaultForm);
    return [defaultForm];
  }

  return (data || []).map(mapFormFromDb);
};

export const getFormById = async (id: string): Promise<Form | undefined> => {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return undefined;
  const form = mapFormFromDb(data);

  // Attach linked pricing template if present
  const templateId = (form as any).settings?.pricingTemplateId as string | null | undefined;
  if (templateId) {
    try {
      const tpl = await getPricingTemplateById(templateId);
      if (tpl) (form as any).pricingTemplate = tpl;
    } catch (e) {
      // Template missing / deleted / unreachable → fall back to static pricing silently.
      console.warn('Linked pricing template failed to load', e);
    }
  }

  return form;
};

export const getAttendee = async (id: string): Promise<Attendee | undefined> => {
  const { data, error } = await supabase
    .rpc('get_attendee_by_id', { lookup_id: id })
    .single();

  if (error) return undefined;
  return mapAttendeeFromDb(data as any);
};

export const getGuestsByPrimaryId = async (primaryId: string): Promise<Attendee[]> => {
  const { data, error } = await supabase
    .rpc('get_guests_by_primary', { p_id: primaryId })
    .order('registered_at', { ascending: true });

  if (error) {
    console.error("Failed to load guests by primary ID", error);
    return [];
  }

  return ((data as any[]) || []).map(mapAttendeeFromDb);
};

export const saveForm = async (form: Form): Promise<void> => {
  const dbRecord = mapFormToDb(form);
  const { error } = await supabase
    .from('forms')
    .upsert(dbRecord);

  if (error) console.error("Failed to save form", error);
};

export const deleteForm = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', id);

  if (error) console.error("Failed to delete form", error);
};

// --- Settings ---
export const getSettings = async (): Promise<AppSettings> => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) return DEFAULT_SETTINGS;

  const pdfSettings = (data.pdf_settings as unknown as PdfSettings) || DEFAULT_SETTINGS.pdfSettings;

  const settings: AppSettings = {
    paypalClientId: data.paypal_client_id || '',
    currency: data.currency || 'USD',
    ticketPrice: data.ticket_price || 0,
    smtpHost: data.smtp_host || '',
    smtpPort: data.smtp_port || '',
    smtpUser: data.smtp_user || '',
    smtpPass: data.smtp_pass || '',
    emailHeaderLogo: data.email_header_logo || '',
    emailHeaderColor: data.email_header_color || '#f8fafc',
    emailFooterColor: data.email_footer_color || '#f8fafc',
    emailSubject: data.email_subject || '',
    emailBodyTemplate: data.email_body_template || '',
    emailFooterText: data.email_footer_text || '',
    emailGuestSubject: data.email_guest_subject || DEFAULT_SETTINGS.emailGuestSubject,
    emailGuestBody: data.email_guest_body || DEFAULT_SETTINGS.emailGuestBody,
    emailPurchaserGuestNote: data.email_purchaser_guest_note || DEFAULT_SETTINGS.emailPurchaserGuestNote,
    emailInvitationSubject: data.email_invitation_subject || '',
    emailInvitationBody: data.email_invitation_body || '',
    sponsorInvitationSubject: (data as any).sponsor_invitation_subject || DEFAULT_SETTINGS.sponsorInvitationSubject,
    sponsorInvitationBody: (data as any).sponsor_invitation_body || DEFAULT_SETTINGS.sponsorInvitationBody,
    sponsorConfirmationPaidSubject: (data as any).sponsor_confirmation_paid_subject || DEFAULT_SETTINGS.sponsorConfirmationPaidSubject,
    sponsorConfirmationPaidBody: (data as any).sponsor_confirmation_paid_body || DEFAULT_SETTINGS.sponsorConfirmationPaidBody,
    sponsorChequePledgeSubject: (data as any).sponsor_cheque_pledge_subject || DEFAULT_SETTINGS.sponsorChequePledgeSubject,
    sponsorChequePledgeBody: (data as any).sponsor_cheque_pledge_body || DEFAULT_SETTINGS.sponsorChequePledgeBody,
    sponsorChequeInternalSubject: (data as any).sponsor_cheque_internal_subject || DEFAULT_SETTINGS.sponsorChequeInternalSubject,
    sponsorChequeInternalBody: (data as any).sponsor_cheque_internal_body || DEFAULT_SETTINGS.sponsorChequeInternalBody,
    sponsorChequeInternalRecipients: (data as any).sponsor_cheque_internal_recipients || DEFAULT_SETTINGS.sponsorChequeInternalRecipients,
    sponsorChequeReceivedSubject: (data as any).sponsor_cheque_received_subject || DEFAULT_SETTINGS.sponsorChequeReceivedSubject,
    sponsorChequeReceivedBody: (data as any).sponsor_cheque_received_body || DEFAULT_SETTINGS.sponsorChequeReceivedBody,
    sponsorChequeMailingAddress: (data as any).sponsor_cheque_mailing_address || DEFAULT_SETTINGS.sponsorChequeMailingAddress,
    sponsorHstRate: (data as any).sponsor_hst_rate ?? DEFAULT_SETTINGS.sponsorHstRate,
    pdfSettings: pdfSettings,
    defaultDashboardFormId: (data as any).default_dashboard_form_id || undefined,
    dashboardColumnPrefs: ((data as any).dashboard_column_prefs as Record<string, Record<string, boolean>>) || {},
  };

  return settings;
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  const dbRecord = {
    id: 1,
    paypal_client_id: settings.paypalClientId,
    currency: settings.currency,
    ticket_price: settings.ticketPrice,
    smtp_host: settings.smtpHost,
    smtp_port: settings.smtpPort,
    smtp_user: settings.smtpUser,
    smtp_pass: settings.smtpPass,
    email_header_logo: settings.emailHeaderLogo,
    email_header_color: settings.emailHeaderColor,
    email_footer_color: settings.emailFooterColor,
    email_subject: settings.emailSubject,
    email_body_template: settings.emailBodyTemplate,
    email_footer_text: settings.emailFooterText,
    email_guest_subject: settings.emailGuestSubject,
    email_guest_body: settings.emailGuestBody,
    email_purchaser_guest_note: settings.emailPurchaserGuestNote,
    email_invitation_subject: settings.emailInvitationSubject,
    email_invitation_body: settings.emailInvitationBody,
    pdf_settings: settings.pdfSettings as unknown as Database['public']['Tables']['app_settings']['Row']['pdf_settings'],
    default_dashboard_form_id: settings.defaultDashboardFormId || null,
    dashboard_column_prefs: settings.dashboardColumnPrefs || {},
    sponsor_invitation_subject: settings.sponsorInvitationSubject,
    sponsor_invitation_body: settings.sponsorInvitationBody,
    sponsor_confirmation_paid_subject: settings.sponsorConfirmationPaidSubject,
    sponsor_confirmation_paid_body: settings.sponsorConfirmationPaidBody,
    sponsor_cheque_pledge_subject: settings.sponsorChequePledgeSubject,
    sponsor_cheque_pledge_body: settings.sponsorChequePledgeBody,
    sponsor_cheque_internal_subject: settings.sponsorChequeInternalSubject,
    sponsor_cheque_internal_body: settings.sponsorChequeInternalBody,
    sponsor_cheque_internal_recipients: settings.sponsorChequeInternalRecipients as any,
    sponsor_cheque_received_subject: settings.sponsorChequeReceivedSubject,
    sponsor_cheque_received_body: settings.sponsorChequeReceivedBody,
    sponsor_cheque_mailing_address: settings.sponsorChequeMailingAddress,
    sponsor_hst_rate: settings.sponsorHstRate,
  };

  const { error } = await supabase
    .from('app_settings')
    .upsert(dbRecord);

  if (error) console.error("Failed to save settings", error);
};

export const clearData = async (): Promise<void> => {
  // Not used in Supabase version usually, but for completeness:
  await supabase.from('attendees').delete().neq('id', '0');
  await supabase.from('forms').delete().neq('id', '0');
};

// --- Mapping Helpers ---
function mapAttendeeFromDb(db: AttendeeRow): Attendee {
  const donationDetails = (db.donation_details as any) || {};
  return {
    id: db.id,
    formId: db.form_id,
    formTitle: db.form_title || '',
    name: db.name,
    email: db.email,
    ticketType: db.ticket_type,
    registeredAt: db.registered_at, // Assumed string from DB
    checkedInAt: db.checked_in_at,
    qrPayload: db.qr_payload,
    paymentStatus: db.payment_status as Attendee['paymentStatus'], // Managed by constraints
    invoiceId: db.invoice_id || undefined,
    transactionId: db.transaction_id || undefined,
    paymentAmount: db.payment_amount || undefined,
    answers: (db.answers as Record<string, any>) || {},
    isTest: db.is_test || false,
    donationType: donationDetails.donationType || 'none',
    donatedTables: donationDetails.donatedTables || 0,
    donatedSeats: db.donation_amount || 0,
    dietaryPreferences: db.dietary_preferences || undefined,
    primaryAttendeeId: db.primary_attendee_id || undefined,
    isPrimary: db.is_primary ?? true,
    assignedTableId: db.assigned_table_id || null,
    assignedSeat: db.assigned_seat ?? null,
    guestType: (db.guest_type as Attendee['guestType']) || undefined,
    sponsorTier: (db as any).sponsor_tier || null,
    sponsorItems: ((db as any).sponsor_items as any[]) || [],
    paymentMethod: (db as any).payment_method || null,
    companyInfo: ((db as any).company_info as any) || undefined,
    sponsoredAwards: ((db as any).sponsored_awards as string[]) || [],
    adminNotes: (db as any).admin_notes || undefined,
  };
}

export function mapAttendeeToDb(a: Attendee): AttendeeInsert {
  return {
    id: a.id,
    form_id: a.formId,
    form_title: a.formTitle,
    name: a.name,
    email: a.email,
    ticket_type: a.ticketType,
    registered_at: a.registeredAt,
    checked_in_at: a.checkedInAt,
    qr_payload: a.qrPayload,
    payment_status: a.paymentStatus,
    invoice_id: a.invoiceId,
    transaction_id: a.transactionId,
    payment_amount: a.paymentAmount,
    answers: a.answers,
    is_test: a.isTest,
    donation_amount: a.donatedSeats || 0,
    donation_details: { donationType: a.donationType || 'none', donatedTables: a.donatedTables || 0 } as any,
    dietary_preferences: a.dietaryPreferences || null,
    primary_attendee_id: a.primaryAttendeeId || null,
    is_primary: a.isPrimary ?? true,
    assigned_table_id: a.assignedTableId || null,
    assigned_seat: a.assignedSeat ?? null,
    guest_type: a.guestType || null,
    sponsor_tier: a.sponsorTier || null,
    sponsor_items: (a.sponsorItems as any) || [],
    payment_method: a.paymentMethod || null,
    company_info: (a.companyInfo as any) || {},
    sponsored_awards: (a.sponsoredAwards as any) || [],
    admin_notes: a.adminNotes || null,
  };
}

function mapFormFromDb(db: FormRow): Form {
  return {
    id: db.id,
    title: db.title,
    description: db.description,
    createdAt: db.created_at,
    status: db.status as 'active' | 'draft' | 'closed',
    // IMPORTANT: Pass through form_type from DB — do NOT hardcode a ternary here.
    // Bug history: hardcoded 'sponsor' ? 'sponsor' : 'event' silently dropped 'exhibitor'.
    // Any new form_type value added to the CHECK constraint must pass through without changes.
    formType: (db as any).form_type || 'event',
    settings: (db.settings as any), // Cast JSON to specific setting type if needed
    thankYouMessage: db.thank_you_message || undefined,
    fields: (db.fields as unknown as FormField[]) || []
  };
}

function mapFormToDb(f: Form): FormInsert {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    status: f.status,
    form_type: f.formType || 'event',
    settings: f.settings as any,
    thank_you_message: f.thankYouMessage,
    fields: f.fields as any
  };
}

// --- Seating Configurations ---
export const getSeatingConfigurations = async (formId: string): Promise<SeatingConfiguration[]> => {
  const { data, error } = await supabase
    .from('seating_configurations')
    .select('*')
    .eq('form_id', formId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Failed to load seating configurations", error);
    return [];
  }

  return (data || []).map(mapSeatingConfigFromDb);
};

export const saveSeatingConfiguration = async (config: SeatingConfiguration): Promise<void> => {
  const dbRecord = mapSeatingConfigToDb(config);
  const { error } = await supabase
    .from('seating_configurations')
    .upsert(dbRecord);

  if (error) console.error("Failed to save seating configuration", error);
};

export const deleteSeatingConfiguration = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('seating_configurations')
    .delete()
    .eq('id', id);

  if (error) console.error("Failed to delete seating configuration", error);
};

function mapSeatingConfigFromDb(db: SeatingConfigurationRow): SeatingConfiguration {
  return {
    id: db.id,
    formId: db.form_id,
    name: db.name,
    createdAt: db.created_at
  };
}

function mapSeatingConfigToDb(c: SeatingConfiguration): SeatingConfigurationInsert {
  return {
    id: c.id,
    form_id: c.formId,
    name: c.name
  };
}

// --- Seating Tables ---
type SeatingTableRow = Database['public']['Tables']['seating_tables']['Row'];
type SeatingTableInsert = Database['public']['Tables']['seating_tables']['Insert'];

export const getSeatingTables = async (formId: string, configurationId?: string | null): Promise<SeatingTable[]> => {
  let query = supabase.from('seating_tables').select('*').eq('form_id', formId);

  if (configurationId) {
    query = query.eq('configuration_id', configurationId);
  } else {
    query = query.is('configuration_id', null);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    console.error("Failed to load seating tables", error);
    return [];
  }

  return (data || []).map(mapSeatingTableFromDb);
};

export const saveSeatingTable = async (table: SeatingTable): Promise<void> => {
  const dbRecord = mapSeatingTableToDb(table);
  const { error } = await supabase
    .from('seating_tables')
    .upsert(dbRecord);

  if (error) console.error("Failed to save seating table", error);
};

export const saveSeatingTables = async (tables: SeatingTable[], formId: string, configurationId?: string | null): Promise<void> => {
  const dbTables = tables.map(t => mapSeatingTableToDb({ ...t, configurationId }));

  // 1. Get existing table IDs for this form and configuration
  let query = supabase.from('seating_tables').select('id').eq('form_id', formId);
  if (configurationId) {
    query = query.eq('configuration_id', configurationId);
  } else {
    query = query.is('configuration_id', null);
  }

  const { data: existing } = await query;
  const existingIds = existing?.map(r => r.id) || [];
  const currentIds = tables.map(t => t.id);

  // 2. Identify tables to delete
  const toDelete = existingIds.filter(id => !currentIds.includes(id));

  if (toDelete.length > 0) {
    await supabase.from('seating_tables').delete().in('id', toDelete);
  }

  // 3. Upsert current tables
  const { error } = await supabase
    .from('seating_tables')
    .upsert(dbTables);

  if (error) console.error("Failed to save seating tables", error);
};

export const deleteSeatingTable = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('seating_tables')
    .delete()
    .eq('id', id);

  if (error) console.error("Failed to delete seating table", error);
};

export const deleteAllSeatingTables = async (formId: string): Promise<void> => {
  const { error } = await supabase
    .from('seating_tables')
    .delete()
    .eq('form_id', formId);

  if (error) console.error("Failed to delete all seating tables", error);
};

function mapSeatingTableFromDb(db: SeatingTableRow): SeatingTable {
  return {
    id: db.id,
    formId: db.form_id,
    configurationId: db.configuration_id,
    name: db.name,
    capacity: db.capacity,
    shape: db.shape as 'round' | 'rect',
    x: db.x,
    z: db.z,
    rotation: db.rotation,
    color: db.color,
    vip: db.vip,
    notes: db.notes,
    createdAt: db.created_at
  };
}

function mapSeatingTableToDb(t: SeatingTable): SeatingTableInsert {
  return {
    id: t.id,
    form_id: t.formId,
    configuration_id: t.configurationId || null,
    name: t.name,
    capacity: t.capacity,
    shape: t.shape,
    x: t.x,
    z: t.z,
    rotation: t.rotation,
    color: t.color,
    vip: t.vip,
    notes: t.notes
  };
}

// --- Seating Assignments ---
export const getSeatingAssignments = async (configurationId: string): Promise<SeatingAssignment[]> => {
  const { data, error } = await supabase
    .from('seating_assignments')
    .select('*')
    .eq('configuration_id', configurationId);

  if (error) {
    console.error("Failed to load seating assignments", error);
    return [];
  }

  return (data || []).map(mapSeatingAssignmentFromDb);
};

export const saveSeatingAssignments = async (assignments: SeatingAssignment[], configurationId: string): Promise<void> => {
  const dbRecords = assignments.map(mapSeatingAssignmentToDb);

  // 1. Delete all existing assignments for this configuration
  await supabase.from('seating_assignments').delete().eq('configuration_id', configurationId);

  // 2. Insert new ones
  if (dbRecords.length > 0) {
    const { error } = await supabase
      .from('seating_assignments')
      .insert(dbRecords);

    if (error) console.error("Failed to save seating assignments", error);
  }
};

export const deleteSeatingAssignment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('seating_assignments')
    .delete()
    .eq('id', id);

  if (error) console.error("Failed to delete seating assignment", error);
};

function mapSeatingAssignmentFromDb(db: SeatingAssignmentRow): SeatingAssignment {
  return {
    id: db.id,
    configurationId: db.configuration_id,
    attendeeId: db.attendee_id,
    tableId: db.table_id,
    seatNumber: db.seat_number
  };
}

function mapSeatingAssignmentToDb(a: SeatingAssignment): SeatingAssignmentInsert {
  return {
    id: a.id,
    configuration_id: a.configurationId,
    attendee_id: a.attendeeId,
    table_id: a.tableId,
    seat_number: a.seatNumber
  };
}

// --- Scene Elements ---
export const getSceneElements = async (configurationId: string): Promise<SceneElement[]> => {
  const { data, error } = await supabase
    .from('scene_elements')
    .select('*')
    .eq('configuration_id', configurationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Failed to load scene elements", error);
    return [];
  }

  return (data || []).map(mapSceneElementFromDb);
};

export const saveSceneElements = async (elements: SceneElement[], configurationId: string): Promise<void> => {
  const dbRecords = elements.map(mapSceneElementToDb);

  // 1. Get existing element IDs for this configuration
  const { data: existing } = await supabase
    .from('scene_elements')
    .select('id')
    .eq('configuration_id', configurationId);

  const existingIds = existing?.map(r => r.id) || [];
  const currentIds = elements.map(e => e.id);

  // 2. Delete removed elements
  const toDelete = existingIds.filter(id => !currentIds.includes(id));
  if (toDelete.length > 0) {
    await supabase.from('scene_elements').delete().in('id', toDelete);
  }

  // 3. Upsert current elements
  if (dbRecords.length > 0) {
    const { error } = await supabase
      .from('scene_elements')
      .upsert(dbRecords);

    if (error) console.error("Failed to save scene elements", error);
  }
};

export const deleteSceneElement = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('scene_elements')
    .delete()
    .eq('id', id);

  if (error) console.error("Failed to delete scene element", error);
};

function mapSceneElementFromDb(db: SceneElementRow): SceneElement {
  return {
    id: db.id,
    configurationId: db.configuration_id,
    elementType: db.element_type as SceneElementType,
    label: db.label,
    color: db.color,
    x: db.x,
    y: db.y,
    z: db.z,
    rotationY: db.rotation_y,
    scaleX: db.scale_x,
    scaleY: db.scale_y,
    scaleZ: db.scale_z,
    createdAt: db.created_at,
    customModelId: db.custom_model_id || undefined
  };
}

function mapSceneElementToDb(e: SceneElement): SceneElementInsert {
  return {
    id: e.id,
    configuration_id: e.configurationId,
    element_type: e.elementType,
    label: e.label,
    color: e.color,
    x: e.x,
    y: e.y,
    z: e.z,
    rotation_y: e.rotationY,
    scale_x: e.scaleX,
    scale_y: e.scaleY,
    scale_z: e.scaleZ,
    custom_model_id: e.customModelId || null
  };
}

// --- Custom 3D Models ---
export const getCustom3DModels = async (): Promise<Custom3DModel[]> => {
  const { data, error } = await supabase
    .from('custom_3d_models')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Failed to load custom 3D models", error);
    return [];
  }

  return (data || []).map(mapCustomModelFromDb);
};

export const uploadCustom3DModel = async (file: File): Promise<Custom3DModel | null> => {
  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop() || 'glb';
  const filePath = `models/${id}.${ext}`;

  // 1. Upload file to Supabase Storage
  const { error: uploadError } = await supabase
    .storage
    .from('3d-models')
    .upload(filePath, file, { contentType: file.type || 'model/gltf-binary' });

  if (uploadError) {
    console.error("Failed to upload 3D model file", uploadError);
    return null;
  }

  // 2. Save metadata to DB
  const modelRecord: Custom3DModelInsert = {
    id,
    name: file.name.replace(/\.[^.]+$/, ''),
    file_path: filePath,
    file_size: file.size,
  };

  const { error: dbError } = await supabase
    .from('custom_3d_models')
    .insert(modelRecord);

  if (dbError) {
    console.error("Failed to save 3D model metadata", dbError);
    // Clean up uploaded file
    await supabase.storage.from('3d-models').remove([filePath]);
    return null;
  }

  return {
    id,
    name: modelRecord.name,
    filePath,
    fileSize: file.size,
    createdAt: new Date().toISOString(),
  };
};

export const deleteCustom3DModel = async (model: Custom3DModel): Promise<void> => {
  // 1. Delete from storage
  await supabase.storage.from('3d-models').remove([model.filePath]);

  // 2. Delete from DB
  const { error } = await supabase
    .from('custom_3d_models')
    .delete()
    .eq('id', model.id);

  if (error) console.error("Failed to delete 3D model", error);
};

export const getModelPublicUrl = (filePath: string): string => {
  const { data } = supabase.storage.from('3d-models').getPublicUrl(filePath);
  return data.publicUrl;
};

function mapCustomModelFromDb(db: Custom3DModelRow): Custom3DModel {
  return {
    id: db.id,
    name: db.name,
    filePath: db.file_path,
    fileSize: db.file_size,
    thumbnailPath: db.thumbnail_path || undefined,
    createdAt: db.created_at,
  };
}

// ============================================================
// Sponsor queries
// ============================================================

export const getSponsorAttendees = async (): Promise<Attendee[]> => {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .not('sponsor_tier', 'is', null)
    .eq('is_primary', true)
    .order('registered_at', { ascending: false });

  if (error) {
    console.error('Failed to load sponsor attendees', error);
    return [];
  }
  return (data || []).map(mapAttendeeFromDb);
};

// ============================================================
// Sponsor prospects
// ============================================================

export const getProspects = async (): Promise<SponsorProspect[]> => {
  const { data, error } = await supabase
    .from('sponsor_prospects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load prospects', error);
    return [];
  }
  return (data || []).map(mapProspectFromDb);
};

export const saveProspect = async (p: SponsorProspect): Promise<void> => {
  const { error } = await supabase
    .from('sponsor_prospects')
    .upsert(mapProspectToDb(p));
  if (error) throw new Error(`Failed to save prospect: ${error.message}`);
};

export const deleteProspect = async (id: string): Promise<void> => {
  const { error } = await supabase.from('sponsor_prospects').delete().eq('id', id);
  if (error) console.error('Failed to delete prospect', error);
};

export const updateProspectStatus = async (id: string, status: SponsorProspectStatus): Promise<void> => {
  const patch: any = { status };
  if (status === 'invited') {
    patch.invited_at = new Date().toISOString();
    patch.last_emailed_at = new Date().toISOString();
  }
  const { error } = await supabase.from('sponsor_prospects').update(patch).eq('id', id);
  if (error) console.error('Failed to update prospect status', error);
};

export const logProspectEmail = async (
  id: string,
  entry: { sentAt: string; subject: string; templateKey: string; recipientEmail: string }
): Promise<void> => {
  const { data } = await supabase
    .from('sponsor_prospects')
    .select('email_history, status')
    .eq('id', id)
    .single();
  if (!data) return;
  const history = (data.email_history as any[]) || [];
  history.push(entry);
  const newStatus = data.status === 'prospect' ? 'invited' : data.status;
  await supabase
    .from('sponsor_prospects')
    .update({
      email_history: history as any,
      last_emailed_at: entry.sentAt,
      invited_at: data.status === 'prospect' ? entry.sentAt : undefined,
      status: newStatus,
    })
    .eq('id', id);
};

function mapProspectFromDb(db: any): SponsorProspect {
  return {
    id: db.id,
    orgName: db.org_name,
    contactName: db.contact_name || undefined,
    contactTitle: db.contact_title || undefined,
    contactEmail: db.contact_email,
    contactPhone: db.contact_phone || undefined,
    status: db.status,
    sponsorFormId: db.sponsor_form_id,
    invitedAt: db.invited_at,
    lastEmailedAt: db.last_emailed_at,
    emailHistory: (db.email_history as any[]) || [],
    notes: db.notes || undefined,
    createdAt: db.created_at,
  };
}

function mapProspectToDb(p: SponsorProspect): any {
  return {
    id: p.id,
    org_name: p.orgName,
    contact_name: p.contactName || null,
    contact_title: p.contactTitle || null,
    contact_email: p.contactEmail,
    contact_phone: p.contactPhone || null,
    status: p.status,
    sponsor_form_id: p.sponsorFormId || null,
    invited_at: p.invitedAt || null,
    last_emailed_at: p.lastEmailedAt || null,
    email_history: p.emailHistory as any,
    notes: p.notes || null,
  };
}

// --- Pricing Templates ---

function mapPricingTemplateRow(row: any): PricingTemplate {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    currency: row.currency,
    isActive: row.is_active,
    tiers: row.tiers ?? [],
    dateBrackets: row.date_brackets ?? [],
    activeBracketOverride: row.active_bracket_override ?? null,
    categories: row.categories ?? [],
    addons: row.addons ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pricingTemplateToRow(t: Partial<PricingTemplate>): any {
  return {
    ...(t.id ? { id: t.id } : {}),
    ...(t.name !== undefined ? { name: t.name } : {}),
    ...(t.timezone !== undefined ? { timezone: t.timezone } : {}),
    ...(t.currency !== undefined ? { currency: t.currency } : {}),
    ...(t.isActive !== undefined ? { is_active: t.isActive } : {}),
    ...(t.tiers !== undefined ? { tiers: t.tiers } : {}),
    ...(t.dateBrackets !== undefined ? { date_brackets: t.dateBrackets } : {}),
    ...(t.activeBracketOverride !== undefined
      ? { active_bracket_override: t.activeBracketOverride }
      : {}),
    ...(t.categories !== undefined ? { categories: t.categories } : {}),
    ...(t.addons !== undefined ? { addons: t.addons } : {}),
  };
}

export async function getPricingTemplates(): Promise<PricingTemplate[]> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPricingTemplateRow);
}

export async function getPricingTemplateById(id: string): Promise<PricingTemplate | null> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPricingTemplateRow(data) : null;
}

export async function createPricingTemplate(
  template: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PricingTemplate> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .insert(pricingTemplateToRow(template))
    .select()
    .single();
  if (error) throw error;
  return mapPricingTemplateRow(data);
}

export async function updatePricingTemplate(
  id: string,
  patch: Partial<PricingTemplate>,
): Promise<PricingTemplate> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .update(pricingTemplateToRow(patch))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapPricingTemplateRow(data);
}

export async function archivePricingTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('pricing_templates')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function duplicatePricingTemplate(id: string, newName: string): Promise<PricingTemplate> {
  const original = await getPricingTemplateById(id);
  if (!original) throw new Error('Template not found');
  const { id: _omit, createdAt: _c, updatedAt: _u, ...rest } = original;
  return createPricingTemplate({ ...rest, name: newName, isActive: true });
}