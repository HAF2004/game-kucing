import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createSqliteDatabase } from './src/server/db';
import { createApiContext, createApiRouter } from './src/server/apiRouter';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // Initialize persistent SQLite database outside publicly served web directories
  const db = createSqliteDatabase();
  const apiCtx = createApiContext(db);

  app.disable('x-powered-by');
  app.use('/api/v1', createApiRouter(apiCtx));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Kucing Terbang server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
