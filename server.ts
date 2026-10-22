import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { createDatabase } from './src/server/db.js';
import { createApiContext, handleApiRequest } from './src/server/apiRouter.js';

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const db = await createDatabase({ runMigrations: true, seedInitialRivals: true });
  const apiContext = createApiContext(db);

  app.disable('x-powered-by');
  app.use('/api', express.raw({ type: 'application/json', limit: '16kb' }));
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      headers.set('x-forwarded-for', req.ip || '127.0.0.1');
      const host = req.headers.host || 'localhost';
      const body = Buffer.isBuffer(req.body) ? req.body : undefined;
      const request = new Request('http://' + host + req.originalUrl, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' || !body ? undefined : new Uint8Array(body),
      });
      const response = await handleApiRequest(apiContext, request);
      res.status(response.status);
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.send(await response.text());
    } catch (error) {
      next(error);
    }
  });
  app.use('/api', (error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : 500;
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST';
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
      ok: false,
      error: {
        code,
        message: status === 413 ? 'Data permintaan terlalu besar.' : 'Permintaan API tidak dapat diproses.',
      },
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log('Kucing Terbang server running on port ' + port);
  });
}

startServer().catch((error: unknown) => {
  console.error('Failed to start server:', error instanceof Error ? error.name : 'UnknownError');
  process.exit(1);
});
