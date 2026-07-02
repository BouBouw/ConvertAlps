/**
 * Tests des routes Express (API integration tests)
 * TASK 9 — Tests automatisés backend
 */
import request from 'supertest';

// Import direct de l'app sans démarrer le serveur
// (le module exporte app)
let app: import('express').Express;

beforeAll(async () => {
  // Éviter l'initialisation Prisma dans les tests
  process.env.DATABASE_URL = 'file:./test.db';
  const mod = await import('../src/server');
  app = mod.app;
});

describe('GET /health', () => {
  it('retourne status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/tooling/tools', () => {
  it('retourne un tableau d\'outils', async () => {
    const res = await request(app).get('/api/tooling/tools');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('GET /api/tooling/materials', () => {
  it('retourne les matières', async () => {
    const res = await request(app).get('/api/tooling/materials');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
  });
});

describe('GET /api/settings/machine', () => {
  it('retourne la config machine par défaut', async () => {
    const res = await request(app).get('/api/settings/machine');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('limits');
    expect(res.body.data).toHaveProperty('fixtures');
  });
});

describe('POST /api/projects', () => {
  it('sauvegarde un nouveau projet', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Test Projet', description: 'Tests automatisés' });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Test Projet');
  });
});

describe('POST /api/fao/calculate — validation Zod', () => {
  it('rejette un body sans featureIds', async () => {
    const res = await request(app).post('/api/fao/calculate').send({ materialId: 'mat-aa2024-001' });
    expect(res.status).toBe(400);
  });
});
