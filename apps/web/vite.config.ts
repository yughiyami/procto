import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves the Vercel-style functions in ./api during `pnpm dev` and `pnpm preview`,
 * so fee sponsorship and the demo faucet work locally exactly as in production.
 * Handlers use the Web Request/Response signature (export async function POST).
 */
function localApi(): Plugin {
  const routes = ['/api/sponsor', '/api/faucet', '/api/paco'];
  async function handle(
    load: (path: string) => Promise<Record<string, unknown>>,
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const method = (req.method ?? 'GET').toUpperCase();
    const mod = await load(`${path}.ts`);
    const fn = mod[method] as ((r: Request) => Promise<Response>) | undefined;
    const response = fn
      ? await fn(
          new Request(`http://localhost${req.url}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
          }),
        )
      : new Response(JSON.stringify({ error: 'Método no permitido.' }), { status: 405 });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  return {
    name: 'procto-local-api',
    configResolved(config) {
      // Server-only secrets (no VITE_ prefix) are read from .env.local into process.env.
      const env = loadEnv(config.mode, config.root, '');
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (!routes.includes(path)) return next();
        try {
          await handle((p) => server.ssrLoadModule(p), req, res);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: {
    port: 5173,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
  preview: { headers: { 'Cache-Control': 'no-store' } },
  build: {
    target: 'es2022',
  },
});
