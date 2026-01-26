import { Attendee, Form, AppSettings, DEFAULT_SETTINGS } from '../types';

const STORAGE_KEY_ATTENDEES = 'eventcheck_attendees_v1';
const STORAGE_KEY_FORMS = 'eventcheck_forms_v1';
const STORAGE_KEY_SETTINGS = 'eventcheck_settings_v1';

// --- Attendees ---
export const getAttendees = (): Attendee[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_ATTENDEES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load attendees", error);
    return [];
  }
};

export const getAttendeesByForm = (formId: string): Attendee[] => {
  return getAttendees().filter(a => a.formId === formId);
};

export const saveAttendee = (attendee: Attendee): void => {
  const current = getAttendees();
  // Check update or insert
  const index = current.findIndex(a => a.id === attendee.id);
  if (index !== -1) {
    current[index] = attendee;
  } else {
    current.unshift(attendee);
  }
  localStorage.setItem(STORAGE_KEY_ATTENDEES, JSON.stringify(current));
};

export const checkInAttendee = (id: string): Attendee | null => {
  const current = getAttendees();
  const index = current.findIndex(a => a.id === id);
  
  if (index === -1) return null;
  
  const attendee = current[index];
  if (attendee.checkedInAt) {
    return attendee; 
  }

  const updatedAttendee = { ...attendee, checkedInAt: new Date().toISOString() };
  current[index] = updatedAttendee;
  
  localStorage.setItem(STORAGE_KEY_ATTENDEES, JSON.stringify(current));
  return updatedAttendee;
};

// --- Forms ---
export const getForms = (): Form[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_FORMS);
    if (!data) {
      // Create a default demo form if none exist
      const defaultForm: Form = {
        id: 'default_event',
        title: 'General Event Registration',
        description: 'Please fill out your details to register.',
        createdAt: new Date().toISOString(),
        status: 'active',
        fields: [
          { id: 'f_name', type: 'text', label: 'Full Name', required: true },
          { id: 'f_email', type: 'email', label: 'Email Address', required: true }
        ]
      };
      saveForm(defaultForm);
      return [defaultForm];
    }
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

export const getFormById = (id: string): Form | undefined => {
  const forms = getForms();
  return forms.find(f => f.id === id);
};

export const saveForm = (form: Form) => {
  const forms = getForms();
  const index = forms.findIndex(f => f.id === form.id);
  if (index !== -1) {
    forms[index] = form;
  } else {
    forms.push(form);
  }
  localStorage.setItem(STORAGE_KEY_FORMS, JSON.stringify(forms));
};

export const deleteForm = (id: string) => {
  const forms = getForms().filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEY_FORMS, JSON.stringify(forms));
};

// --- Settings ---
export const getSettings = (): AppSettings => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!data) return DEFAULT_SETTINGS;
    
    const parsed = JSON.parse(data);
    // Merge with defaults to ensure new fields (like pdfSettings) exist if upgrading from old version
    return { ...DEFAULT_SETTINGS, ...parsed, pdfSettings: { ...DEFAULT_SETTINGS.pdfSettings, ...parsed.pdfSettings } };
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
};

export const clearData = () => {
  localStorage.removeItem(STORAGE_KEY_ATTENDEES);
  localStorage.removeItem(STORAGE_KEY_FORMS);
  localStorage.removeItem(STORAGE_KEY_SETTINGS);
};