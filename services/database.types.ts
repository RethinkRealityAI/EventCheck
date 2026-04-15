export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            attendees: {
                Row: {
                    id: string
                    form_id: string
                    form_title: string | null
                    name: string
                    email: string
                    ticket_type: string
                    registered_at: string
                    checked_in_at: string | null
                    qr_payload: string
                    payment_status: 'paid' | 'pending' | 'free' | null
                    invoice_id: string | null
                    transaction_id: string | null
                    payment_amount: string | null
                    answers: Json | null
                    is_test: boolean | null
                    donation_amount: number
                    donation_details: Json | null
                    dietary_preferences: string | null
                    primary_attendee_id: string | null
                    is_primary: boolean
                    assigned_table_id: string | null
                    assigned_seat: number | null
                    guest_type: string | null
                    sponsor_tier: string | null
                    sponsor_items: Json | null
                    payment_method: string | null
                    company_info: Json | null
                    sponsored_awards: Json | null
                    admin_notes: string | null
                }
                Insert: {
                    id: string
                    form_id: string
                    form_title?: string | null
                    name: string
                    email: string
                    ticket_type: string
                    registered_at?: string
                    checked_in_at?: string | null
                    qr_payload: string
                    payment_status?: 'paid' | 'pending' | 'free' | null
                    invoice_id?: string | null
                    transaction_id?: string | null
                    payment_amount?: string | null
                    answers?: Json | null
                    is_test?: boolean | null
                    donation_amount?: number
                    donation_details?: Json | null
                    dietary_preferences?: string | null
                    primary_attendee_id?: string | null
                    is_primary?: boolean
                    assigned_table_id?: string | null
                    assigned_seat?: number | null
                    guest_type?: string | null
                    sponsor_tier?: string | null
                    sponsor_items?: Json | null
                    payment_method?: string | null
                    company_info?: Json | null
                    sponsored_awards?: Json | null
                    admin_notes?: string | null
                }
                Update: {
                    id?: string
                    form_id?: string
                    form_title?: string | null
                    name?: string
                    email?: string
                    ticket_type?: string
                    registered_at?: string
                    checked_in_at?: string | null
                    qr_payload?: string
                    payment_status?: 'paid' | 'pending' | 'free' | null
                    invoice_id?: string | null
                    transaction_id?: string | null
                    payment_amount?: string | null
                    answers?: Json | null
                    is_test?: boolean | null
                    donation_amount?: number
                    donation_details?: Json | null
                    dietary_preferences?: string | null
                    primary_attendee_id?: string | null
                    is_primary?: boolean
                    assigned_table_id?: string | null
                    assigned_seat?: number | null
                    guest_type?: string | null
                    sponsor_tier?: string | null
                    sponsor_items?: Json | null
                    payment_method?: string | null
                    company_info?: Json | null
                    sponsored_awards?: Json | null
                    admin_notes?: string | null
                }
            }
            forms: {
                Row: {
                    id: string
                    title: string
                    description: string
                    created_at: string
                    status: 'active' | 'draft' | 'closed'
                    settings: Json | null
                    thank_you_message: string | null
                    fields: Json
                    form_type: string
                }
                Insert: {
                    id: string
                    title: string
                    description: string
                    created_at?: string
                    status: 'active' | 'draft' | 'closed'
                    settings?: Json | null
                    thank_you_message?: string | null
                    fields: Json
                    form_type?: string
                }
                Update: {
                    id?: string
                    title?: string
                    description?: string
                    created_at?: string
                    status?: 'active' | 'draft' | 'closed'
                    settings?: Json | null
                    thank_you_message?: string | null
                    fields?: Json
                    form_type?: string
                }
            }
            app_settings: {
                Row: {
                    id: number
                    paypal_client_id: string | null
                    currency: string | null
                    ticket_price: number | null
                    smtp_host: string | null
                    smtp_port: string | null
                    smtp_user: string | null
                    smtp_pass: string | null
                    email_header_logo: string | null
                    email_header_color: string | null
                    email_footer_color: string | null
                    email_subject: string | null
                    email_body_template: string | null
                    email_footer_text: string | null
                    email_invitation_subject: string | null
                    email_invitation_body: string | null
                    pdf_settings: Json | null
                    sponsor_invitation_subject: string | null
                    sponsor_invitation_body: string | null
                    sponsor_confirmation_paid_subject: string | null
                    sponsor_confirmation_paid_body: string | null
                    sponsor_cheque_pledge_subject: string | null
                    sponsor_cheque_pledge_body: string | null
                    sponsor_cheque_internal_subject: string | null
                    sponsor_cheque_internal_body: string | null
                    sponsor_cheque_internal_recipients: Json | null
                    sponsor_cheque_received_subject: string | null
                    sponsor_cheque_received_body: string | null
                    sponsor_cheque_mailing_address: string | null
                    sponsor_hst_rate: number | null
                }
                Insert: {
                    id?: number
                    paypal_client_id?: string | null
                    currency?: string | null
                    ticket_price?: number | null
                    smtp_host?: string | null
                    smtp_port?: string | null
                    smtp_user?: string | null
                    smtp_pass?: string | null
                    email_header_logo?: string | null
                    email_header_color?: string | null
                    email_footer_color?: string | null
                    email_subject?: string | null
                    email_body_template?: string | null
                    email_footer_text?: string | null
                    email_invitation_subject?: string | null
                    email_invitation_body?: string | null
                    pdf_settings?: Json | null
                    sponsor_invitation_subject?: string | null
                    sponsor_invitation_body?: string | null
                    sponsor_confirmation_paid_subject?: string | null
                    sponsor_confirmation_paid_body?: string | null
                    sponsor_cheque_pledge_subject?: string | null
                    sponsor_cheque_pledge_body?: string | null
                    sponsor_cheque_internal_subject?: string | null
                    sponsor_cheque_internal_body?: string | null
                    sponsor_cheque_internal_recipients?: Json | null
                    sponsor_cheque_received_subject?: string | null
                    sponsor_cheque_received_body?: string | null
                    sponsor_cheque_mailing_address?: string | null
                    sponsor_hst_rate?: number | null
                }
                Update: {
                    id?: number
                    paypal_client_id?: string | null
                    currency?: string | null
                    ticket_price?: number | null
                    smtp_host?: string | null
                    smtp_port?: string | null
                    smtp_user?: string | null
                    smtp_pass?: string | null
                    email_header_logo?: string | null
                    email_header_color?: string | null
                    email_footer_color?: string | null
                    email_subject?: string | null
                    email_body_template?: string | null
                    email_footer_text?: string | null
                    email_invitation_subject?: string | null
                    email_invitation_body?: string | null
                    pdf_settings?: Json | null
                    sponsor_invitation_subject?: string | null
                    sponsor_invitation_body?: string | null
                    sponsor_confirmation_paid_subject?: string | null
                    sponsor_confirmation_paid_body?: string | null
                    sponsor_cheque_pledge_subject?: string | null
                    sponsor_cheque_pledge_body?: string | null
                    sponsor_cheque_internal_subject?: string | null
                    sponsor_cheque_internal_body?: string | null
                    sponsor_cheque_internal_recipients?: Json | null
                    sponsor_cheque_received_subject?: string | null
                    sponsor_cheque_received_body?: string | null
                    sponsor_cheque_mailing_address?: string | null
                    sponsor_hst_rate?: number | null
                }
            }
            seating_tables: {
                Row: {
                    id: string
                    form_id: string
                    name: string
                    capacity: number
                    shape: string
                    x: number
                    z: number
                    rotation: number
                    color: string | null
                    vip: boolean
                    notes: string | null
                    configuration_id: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    form_id: string
                    name: string
                    capacity?: number
                    shape?: string
                    x?: number
                    z?: number
                    rotation?: number
                    color?: string | null
                    vip?: boolean
                    notes?: string | null
                    configuration_id?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    form_id?: string
                    name?: string
                    capacity?: number
                    shape?: string
                    x?: number
                    z?: number
                    rotation?: number
                    color?: string | null
                    vip?: boolean
                    notes?: string | null
                    configuration_id?: string | null
                    created_at?: string
                }
            }
            seating_configurations: {
                Row: {
                    id: string
                    form_id: string
                    name: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    form_id: string
                    name: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    form_id?: string
                    name?: string
                    created_at?: string
                }
            }
            seating_assignments: {
                Row: {
                    id: string
                    configuration_id: string
                    attendee_id: string
                    table_id: string
                    seat_number: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    configuration_id: string
                    attendee_id: string
                    table_id: string
                    seat_number: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    configuration_id?: string
                    attendee_id?: string
                    table_id?: string
                    seat_number?: number
                    created_at?: string
                }
            }
            scene_elements: {
                Row: {
                    id: string
                    configuration_id: string
                    element_type: string
                    label: string
                    color: string
                    x: number
                    y: number
                    z: number
                    rotation_y: number
                    scale_x: number
                    scale_y: number
                    scale_z: number
                    created_at: string
                    custom_model_id?: string | null
                }
                Insert: {
                    id?: string
                    configuration_id: string
                    element_type?: string
                    label?: string
                    color?: string
                    x?: number
                    y?: number
                    z?: number
                    rotation_y?: number
                    scale_x?: number
                    scale_y?: number
                    scale_z?: number
                    created_at?: string
                    custom_model_id?: string | null
                }
                Update: {
                    id?: string
                    configuration_id?: string
                    element_type?: string
                    label?: string
                    color?: string
                    x?: number
                    y?: number
                    z?: number
                    rotation_y?: number
                    scale_x?: number
                    scale_y?: number
                    scale_z?: number
                    created_at?: string
                    custom_model_id?: string | null
                }
            }
            custom_3d_models: {
                Row: {
                    id: string
                    name: string
                    file_path: string
                    file_size: number
                    thumbnail_path: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    file_path: string
                    file_size?: number
                    thumbnail_path?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    file_path?: string
                    file_size?: number
                    thumbnail_path?: string | null
                    created_at?: string
                }
            }
            sponsor_prospects: {
                Row: {
                    id: string
                    org_name: string
                    contact_name: string | null
                    contact_title: string | null
                    contact_email: string
                    contact_phone: string | null
                    status: string
                    sponsor_form_id: string | null
                    invited_at: string | null
                    last_emailed_at: string | null
                    email_history: Json
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    org_name: string
                    contact_name?: string | null
                    contact_title?: string | null
                    contact_email: string
                    contact_phone?: string | null
                    status?: string
                    sponsor_form_id?: string | null
                    invited_at?: string | null
                    last_emailed_at?: string | null
                    email_history?: Json
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    org_name?: string
                    contact_name?: string | null
                    contact_title?: string | null
                    contact_email?: string
                    contact_phone?: string | null
                    status?: string
                    sponsor_form_id?: string | null
                    invited_at?: string | null
                    last_emailed_at?: string | null
                    email_history?: Json
                    notes?: string | null
                    created_at?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
