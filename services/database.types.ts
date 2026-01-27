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
