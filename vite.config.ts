import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvIntoProcess() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* no .env */
  }
}

/** Local Vite middleware so Additional COA checkout works without deploying. */
function brandedCoaApiPlugin(): Plugin {
  return {
    name: 'branded-coa-api',
    configureServer(server: ViteDevServer) {
      loadEnvIntoProcess();
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (url !== '/api/clone-coa-for-brand') return next();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(Buffer.from(c)));
        req.on('end', () => {
          void (async () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const body = raw ? JSON.parse(raw) : {};
              const { default: handler } = await server.ssrLoadModule('/api/clone-coa-for-brand.ts');
              const fakeRes = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  return this;
                },
                setHeader(k: string, v: string) {
                  res.setHeader(k, v);
                },
                json(payload: unknown) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(payload));
                },
                end() {
                  res.statusCode = this.statusCode;
                  res.end();
                },
              };
              await handler(
                { method: req.method, headers: req.headers as Record<string, string>, body },
                fakeRes,
              );
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: err instanceof Error ? err.message : 'Server error',
              }));
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), brandedCoaApiPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
