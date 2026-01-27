import { supabase } from './supabaseClient';

export interface EmailResponse {
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    error?: string;
}

export const sendEmail = async (
    to: string | string[],
    subject: string,
    html: string,
    text?: string
): Promise<EmailResponse> => {
    const { data, error } = await supabase.functions.invoke('send-email', {
        body: { to, subject, html, text },
    });

    if (error) {
        console.error('Error sending email function:', error);
        throw new Error(error.message || 'Failed to invoke email function');
    }

    // The function returns the nodemailer info object or an error object
    if (data?.error) {
        throw new Error(data.error);
    }

    return data;
};
