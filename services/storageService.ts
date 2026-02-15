import { Attendee, Form, AppSettings, DEFAULT_SETTINGS, FormField, PdfSettings, SeatingTable, SeatingConfiguration, SeatingAssignment } from '../types';
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

  if (error) console.error("Failed to save attendee", error);
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

export const checkInAttendee = async (id: string): Promise<Attendee | null> => {
  const { data: existing, error: fetchError } = await supabase
    .from('attendees')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) return null;
  if (existing.checked_in_at) return mapAttendeeFromDb(existing);

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

  return mapAttendeeFromDb(updated);
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
  return mapFormFromDb(data);
};

export const getAttendee = async (id: string): Promise<Attendee | undefined> => {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return undefined;
  return mapAttendeeFromDb(data);
};

export const getGuestsByPrimaryId = async (primaryId: string): Promise<Attendee[]> => {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .eq('primary_attendee_id', primaryId)
    .order('registered_at', { ascending: true });

  if (error) {
    console.error("Failed to load guests by primary ID", error);
    return [];
  }

  return (data || []).map(mapAttendeeFromDb);
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
    emailInvitationSubject: data.email_invitation_subject || '',
    emailInvitationBody: data.email_invitation_body || '',
    pdfSettings: pdfSettings
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
    email_invitation_subject: settings.emailInvitationSubject,
    email_invitation_body: settings.emailInvitationBody,
    pdf_settings: settings.pdfSettings as unknown as Database['public']['Tables']['app_settings']['Row']['pdf_settings']
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
    assignedSeat: db.assigned_seat ?? null
  };
}

function mapAttendeeToDb(a: Attendee): AttendeeInsert {
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
    assigned_seat: a.assignedSeat ?? null
  };
}

function mapFormFromDb(db: FormRow): Form {
  return {
    id: db.id,
    title: db.title,
    description: db.description,
    createdAt: db.created_at,
    status: db.status as 'active' | 'draft' | 'closed',
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