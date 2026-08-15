// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultApp } from '../app.ts';

describe('tunes routes', () => {
  let dataDir: string;
  let app: Express;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'tune-routes-test-'));
    app = createDefaultApp(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('GET /api/tunes returns empty lists initially', async () => {
    const res = await request(app).get('/api/tunes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ overrides: [], tunes: [] });
  });

  it('POST /api/tunes creates a tune and it shows up in the listing', async () => {
    const create = await request(app).post('/api/tunes').send({ title: 'New Tune', data: 'X:1\n' });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ title: 'New Tune', data: 'X:1\n' });

    const list = await request(app).get('/api/tunes');
    expect(list.body.tunes).toHaveLength(1);
  });

  it('POST /api/tunes rejects a body missing title/data', async () => {
    const res = await request(app).post('/api/tunes').send({ title: 'No data' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/tunes/overrides/:key upserts and GET reflects it', async () => {
    const key = 'lib/tunes/cherokee';
    const put = await request(app)
      .put(`/api/tunes/overrides/${encodeURIComponent(key)}`)
      .send({ title: 'Cherokee (edited)', data: 'X:1\n' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ key, title: 'Cherokee (edited)' });

    const list = await request(app).get('/api/tunes');
    expect(list.body.overrides).toEqual([put.body]);
  });

  it('DELETE /api/tunes/overrides/:key is idempotent (204 even if nothing existed)', async () => {
    const res = await request(app).delete(`/api/tunes/overrides/${encodeURIComponent('lib/tunes/nope')}`);
    expect(res.status).toBe(204);
  });

  it('PUT /api/tunes/overrides/:key rejects a path-traversal key with 400, not a filesystem write', async () => {
    const res = await request(app)
      .put(`/api/tunes/overrides/${encodeURIComponent('..\\..\\..\\evil')}`)
      .send({ title: 'x', data: '' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/tunes/tunes/:key edits an existing user tune', async () => {
    const created = await request(app).post('/api/tunes').send({ title: 'Draft', data: 'X:1\n' });
    const key = created.body.key as string;

    const edited = await request(app)
      .put(`/api/tunes/tunes/${encodeURIComponent(key)}`)
      .send({ title: 'Final', data: 'X:1\nT:Final\n' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ key, title: 'Final' });
  });

  it('PUT /api/tunes/tunes/:key 404s for an unknown key', async () => {
    const res = await request(app)
      .put(`/api/tunes/tunes/${encodeURIComponent('lib/my-tunes/unknown')}`)
      .send({ title: 'X', data: '' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/tunes/tunes/:key removes a tune, 404s the second time', async () => {
    const created = await request(app).post('/api/tunes').send({ title: 'Temp', data: '' });
    const key = created.body.key as string;

    const firstDelete = await request(app).delete(`/api/tunes/tunes/${encodeURIComponent(key)}`);
    expect(firstDelete.status).toBe(204);

    const secondDelete = await request(app).delete(`/api/tunes/tunes/${encodeURIComponent(key)}`);
    expect(secondDelete.status).toBe(404);
  });

  it('malformed JSON body yields 400, not a crash', async () => {
    const res = await request(app)
      .post('/api/tunes')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});
