import { Router } from 'express';
import type { TuneStore } from '../tuneStore.ts';
import { parseTuneInput } from '../validation.ts';

export function createTunesRouter(store: TuneStore): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const [overrides, tunes] = await Promise.all([store.listOverrides(), store.listTunes()]);
      res.json({ overrides, tunes });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const input = parseTuneInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title and data are required' });
        return;
      }
      const record = await store.createTune(input);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.put('/overrides/:key', async (req, res, next) => {
    try {
      const input = parseTuneInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title and data are required' });
        return;
      }
      const record = await store.upsertOverride(req.params.key, input);
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/overrides/:key', async (req, res, next) => {
    try {
      await store.deleteOverride(req.params.key);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.put('/tunes/:key', async (req, res, next) => {
    try {
      const input = parseTuneInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title and data are required' });
        return;
      }
      const record = await store.updateTune(req.params.key, input);
      if (!record) {
        res.status(404).json({ error: 'tune not found' });
        return;
      }
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tunes/:key', async (req, res, next) => {
    try {
      const deleted = await store.deleteTune(req.params.key);
      if (!deleted) {
        res.status(404).json({ error: 'tune not found' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
