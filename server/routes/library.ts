import { Router } from 'express';
import type { LibraryStore } from '../libraryStore.ts';
import { parseFolderEditInput, parseFolderInput, parseTuneEditInput, parseTuneInput } from '../validation.ts';

export function createLibraryRouter(store: LibraryStore): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const nodes = await store.listNodes();
      res.json({ nodes });
    } catch (err) {
      next(err);
    }
  });

  router.post('/folders', async (req, res, next) => {
    try {
      const input = parseFolderInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'parentId and title are required' });
        return;
      }
      const record = await store.createFolder(input);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.put('/folders/:id', async (req, res, next) => {
    try {
      const input = parseFolderEditInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      const record = await store.renameFolder(req.params.id, input);
      if (!record) {
        res.status(404).json({ error: 'folder not found' });
        return;
      }
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/folders/:id', async (req, res, next) => {
    try {
      const result = await store.deleteFolder(req.params.id);
      if (result === 'not-found') {
        res.status(404).json({ error: 'folder not found' });
        return;
      }
      if (result === 'not-empty') {
        res.status(409).json({ error: 'folder is not empty' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/tunes', async (req, res, next) => {
    try {
      const input = parseTuneInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'parentId, title, and data are required' });
        return;
      }
      const record = await store.createTune(input);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.put('/tunes/:id', async (req, res, next) => {
    try {
      const input = parseTuneEditInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title and data are required' });
        return;
      }
      const record = await store.updateTune(req.params.id, input);
      if (!record) {
        res.status(404).json({ error: 'tune not found' });
        return;
      }
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tunes/:id', async (req, res, next) => {
    try {
      const deleted = await store.deleteTune(req.params.id);
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
