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
