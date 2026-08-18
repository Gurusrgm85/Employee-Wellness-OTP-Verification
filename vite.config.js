import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import fs from 'fs'
import path from 'path'

// Custom Vite plugin to handle Zoho OAuth token auto-generation & persistence
function zohoTokenRefreshPlugin() {
  return {
    name: 'zoho-token-refresh-plugin',
    configureServer(server) {
      server.middlewares.use('/api/refresh-token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const envPath = path.resolve(process.cwd(), '.env');
        let envConfig = {};

        if (fs.existsSync(envPath)) {
          const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const [k, ...v] = trimmed.split('=');
              if (k) envConfig[k.trim()] = v.join('=').trim();
            }
          }
        }

        const refreshToken = envConfig.REFRESH_TOKEN || process.env.REFRESH_TOKEN;
        const clientId = envConfig.CLIENT_ID || process.env.CLIENT_ID;
        const clientSecret = envConfig.CLIENT_SECRET || process.env.CLIENT_SECRET;
        const accountsUrl = envConfig.ACCOUNTS_URL || 'https://accounts.zoho.in';

        if (!refreshToken) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing REFRESH_TOKEN in .env' }));
          return;
        }

        const params = new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId || '',
          client_secret: clientSecret || '',
          grant_type: 'refresh_token',
        });

        const hostname = accountsUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const urlPath = `/oauth/v2/token?${params.toString()}`;

        console.log('🔄 [Vite Server] Auto-generating fresh Zoho Access Token...');

        const zohoReq = https.request(
          {
            hostname: hostname,
            port: 443,
            path: urlPath,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
          (zohoRes) => {
            let data = '';
            zohoRes.on('data', (chunk) => (data += chunk));
            zohoRes.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.access_token) {
                  console.log('✅ [Vite Server] Successfully auto-generated fresh Access Token!');

                  // Update .env file automatically
                  if (fs.existsSync(envPath)) {
                    let envContent = fs.readFileSync(envPath, 'utf-8');
                    if (envContent.includes('ACCESS_TOKEN=')) {
                      envContent = envContent.replace(
                        /ACCESS_TOKEN=.*/,
                        `ACCESS_TOKEN=${parsed.access_token}`
                      );
                    } else {
                      envContent = `ACCESS_TOKEN=${parsed.access_token}\n` + envContent;
                    }
                    fs.writeFileSync(envPath, envContent, 'utf-8');
                  }
                }

                res.statusCode = zohoRes.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Failed to parse Zoho response', raw: data }));
              }
            });
          }
        );

        zohoReq.on('error', (err) => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });

        zohoReq.end();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), zohoTokenRefreshPlugin()],
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
