// Minimal ambient declarations so the EDGE functions can be type-checked by the
// repo's TypeScript, which otherwise cannot resolve Deno globals, `npm:` or
// `https://` import specifiers.
//
// WHY THIS EXISTS
// On 2026-08-19 a `headerImageUrl: tpl.headerImageUrl` was added to a mode that
// has no `tpl` in scope. It threw ReferenceError on every call and 500'd all
// free-registration invites on BOTH tenants for ~95 minutes. Nothing caught it:
// the file carried `// @ts-nocheck`, the repo's `tsc --noEmit` excludes
// supabase/functions, and CI deployed edge functions with no type or lint step.
//
// The point of these shims is NOT to model these libraries accurately — it is to
// let the checker resolve the imports so it can do the job that actually
// matters here: flagging identifiers that do not exist. Members are therefore
// deliberately loose (`any`); tightening them would create churn without
// catching the class of bug that bit us.

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}
declare module 'https://esm.sh/@supabase/supabase-js@2.46.1' {
  export function createClient(url: string, key: string, options?: any): any;
}
declare module 'jsr:@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}
declare module 'npm:nodemailer' {
  const nodemailer: any;
  export default nodemailer;
}
declare module 'npm:jspdf@2.5.1' {
  export const jsPDF: any;
  export default any;
}
