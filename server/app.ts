import express, { type ErrorRequestHandler } from 'express';
import { createLibraryRouter } from './routes/library.ts';
import { createLibraryStore, InvalidIdError, type LibraryStore } from './libraryStore.ts';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: unknown }).status === 400) {
    res.status(400).json({ error: 'malformed JSON body' });
    return;
  }
  if (err instanceof InvalidIdError) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
};

export function createApp(store: LibraryStore): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/library', createLibraryRouter(store));
  app.use(errorHandler);
  return app;
}

export function createDefaultApp(dataDir: string): express.Express {
  return createApp(createLibraryStore(dataDir));
}
