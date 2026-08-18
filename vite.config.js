import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      'import.meta.env.ACCESS_TOKEN': JSON.stringify(env.ACCESS_TOKEN),
      'import.meta.env.REFRESH_TOKEN': JSON.stringify(env.REFRESH_TOKEN),
      'import.meta.env.SCOPES': JSON.stringify(env.SCOPES),
      'import.meta.env.API_DOMAIN': JSON.stringify(env.API_DOMAIN),
      'import.meta.env.TOKEN_TYPE': JSON.stringify(env.TOKEN_TYPE),
      'import.meta.env.EXPIRES_IN': JSON.stringify(env.EXPIRES_IN),
      'import.meta.env.CLIENT_ID': JSON.stringify(env.CLIENT_ID),
      'import.meta.env.CLIENT_SECRET': JSON.stringify(env.CLIENT_SECRET),
      'import.meta.env.ACCOUNTS_URL': JSON.stringify(env.ACCOUNTS_URL || 'https://accounts.zoho.in'),
    },
    server: {
      proxy: {
        '/zoho-api': {
          target: 'https://www.zohoapis.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zoho-api/, ''),
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Strip browser cookies and origin so Zoho treats it strictly as a pure REST OAuth call
              proxyReq.removeHeader('cookie');
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          },
        },
        '/zoho-oauth': {
          target: 'https://accounts.zoho.in',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zoho-oauth/, ''),
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.removeHeader('cookie');
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
            });
          },
        },
      },
    },
  }
})
