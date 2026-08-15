import express, { type ErrorRequestHandler } from 'express';
import { createTunesRouter } from './routes/tunes.ts';
import { createTuneStore, InvalidKeyError, type TuneStore } from './tuneStore.ts';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: unknown }).status === 400) {
    res.status(400).json({ error: 'malformed JSON body' });
    return;
  }
  if (err instanceof InvalidKeyError) {
    res.status(400).json({ error: 'invalid key' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
};

export function createApp(store: TuneStore): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/tunes', createTunesRouter(store));
  app.use(errorHandler);
  return app;
}

export function createDefaultApp(dataDir: string): express.Express {
  return createApp(createTuneStore(dataDir));
}
