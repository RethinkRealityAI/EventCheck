/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_PAYPAL_CLIENT_ID: string
    readonly VITE_PAYPAL_SANDBOX_CLIENT_ID?: string
    readonly VITE_PAYPAL_ENV?: 'live' | 'sandbox'
    readonly VITE_FLW_PUBLIC_KEY?: string
    readonly VITE_FLW_TEST_PUBLIC_KEY?: string
    readonly VITE_FLW_ENV?: 'live' | 'test'
    readonly VITE_SITE?: 'scago' | 'gansid'
    readonly GEMINI_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
