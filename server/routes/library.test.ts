// server/routes/library.test.ts
// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultApp } from '../app.ts';

describe('library routes', () => {
  let dataDir: string;
  let app: Express;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'library-routes-test-'));
    app = createDefaultApp(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('GET /api/library returns an empty node list initially', async () => {
    const res = await request(app).get('/api/library');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nodes: [] });
  });

  it('POST /api/library/folders creates a root folder', async () => {
    const res = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'folder', parentId: null, title: 'Tunes' });
  });

  it('POST /api/library/folders rejects a missing title', async () => {
    const res = await request(app).post('/api/library/folders').send({ parentId: null });
    expect(res.status).toBe(400);
  });

  it('POST /api/library/tunes creates a tune under a folder, and GET reflects it', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    const tune = await request(app)
      .post('/api/library/tunes')
      .send({ parentId: folder.body.id, title: 'Cherokee', data: 'X:1\n' });
    expect(tune.status).toBe(201);
    expect(tune.body).toMatchObject({ type: 'tune', parentId: folder.body.id, title: 'Cherokee' });

    const list = await request(app).get('/api/library');
    expect(list.body.nodes).toHaveLength(2);
  });

  it('POST /api/library/tunes rejects a body missing data', async () => {
    const res = await request(app).post('/api/library/tunes').send({ parentId: null, title: 'No data' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/library/folders/:id renames a folder', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    const renamed = await request(app).put(`/api/library/folders/${folder.body.id}`).send({ title: 'Jazz Standards' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: folder.body.id, title: 'Jazz Standards' });
  });

  it('PUT /api/library/folders/:id 404s for an unknown id', async () => {
    const res = await request(app).put('/api/library/folders/does-not-exist').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/library/folders/:id removes an empty folder', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    const res = await request(app).delete(`/api/library/folders/${folder.body.id}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/library/folders/:id returns 409 for a non-empty folder', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    await request(app).post('/api/library/tunes').send({ parentId: folder.body.id, title: 'Cherokee', data: '' });
    const res = await request(app).delete(`/api/library/folders/${folder.body.id}`);
    expect(res.status).toBe(409);
  });

  it('DELETE /api/library/folders/:id 404s for an unknown id', async () => {
    const res = await request(app).delete('/api/library/folders/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('PUT /api/library/tunes/:id edits an existing tune', async () => {
    const created = await request(app).post('/api/library/tunes').send({ parentId: null, title: 'Draft', data: 'X:1\n' });
    const edited = await request(app)
      .put(`/api/library/tunes/${created.body.id}`)
      .send({ title: 'Final', data: 'X:1\nT:Final\n' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id: created.body.id, title: 'Final' });
  });

  it('PUT /api/library/tunes/:id 404s for an unknown id', async () => {
    const res = await request(app).put('/api/library/tunes/does-not-exist').send({ title: 'X', data: '' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/library/tunes/:id removes a tune, 404s the second time', async () => {
    const created = await request(app).post('/api/library/tunes').send({ parentId: null, title: 'Temp', data: '' });
    const first = await request(app).delete(`/api/library/tunes/${created.body.id}`);
    expect(first.status).toBe(204);
    const second = await request(app).delete(`/api/library/tunes/${created.body.id}`);
    expect(second.status).toBe(404);
  });

  it('a path-traversal id on PUT /api/library/tunes/:id is rejected with 400 or 404, not a filesystem write', async () => {
    const res = await request(app)
      .put(`/api/library/tunes/${encodeURIComponent('..\\..\\..\\evil')}`)
      .send({ title: 'x', data: '' });
    expect([400, 404]).toContain(res.status);
  });

  it('malformed JSON body yields 400, not a crash', async () => {
    const res = await request(app)
      .post('/api/library/tunes')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});
