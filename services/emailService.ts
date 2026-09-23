import { supabase } from './supabaseClient';
import { classifyEmailFailure, extractInvokeError } from '../utils/emailSendErrors';
import type { AppSettings } from '../types';

export interface EmailResponse {
    ok?: boolean;
    error?: string;
}

/**
 * Send a fully rendered email through send-ticket-email's `raw-html` mode.
 *
 * This used to call a `send-email` function that exists only on SCAGO — as a
 * legacy deploy outside this repo, with its gateway open and no auth check, so
 * it would mail any HTML to any address through SCAGO's mailbox — and does not
 * exist on GANSID at all, where every "send test email" failed with a 404.
 * `raw-html` requires a signed-in admin (supabase.functions.invoke sends the
 * session), which is exactly who uses this: Settings → Email Templates.
 */
export const sendEmail = async (
    to: string | string[],
    subject: string,
    html: string,
    settings?: Pick<AppSettings, 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'emailFromName'>,
): Promise<EmailResponse> => {
    const { data, error } = await supabase.functions.invoke('send-ticket-email', {
        body: {
            mode: 'raw-html',
            to,
            subject,
            html,
            // Same partial config the one-off and bulk senders pass: edge
            // secrets fill whatever is blank (GANSID clears smtp_pass), and
            // fromName must travel or the sender falls back to "SCAGO".
            smtpConfig: settings ? {
                host: settings.smtpHost || 'smtp.ionos.com',
                port: Number(settings.smtpPort || 587),
                user: settings.smtpUser,
                pass: settings.smtpPass,
                fromName: settings.emailFromName || '',
            } : undefined,
        },
    });

    if (error) {
        throw new Error(classifyEmailFailure(await extractInvokeError(error)).message);
    }
    if ((data as EmailResponse | null)?.error) {
        throw new Error(classifyEmailFailure(String((data as EmailResponse).error)).message);
    }
    return (data ?? { ok: true }) as EmailResponse;
};
