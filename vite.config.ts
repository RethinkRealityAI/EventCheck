import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { faviconSiteKey, faviconTags } from './config/favicons';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          // Per-site favicon (VITE_SITE=gansid → GANSID mark, else EventCheck).
          name: 'site-favicon',
          transformIndexHtml: (html: string) =>
            html.replace('</title>', `</title>\n  ${faviconTags(faviconSiteKey(env.VITE_SITE))}`),
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
    };
});
