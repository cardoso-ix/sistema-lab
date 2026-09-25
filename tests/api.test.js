const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/server.js');

let server;
let baseUrl;

before((done) => {
  server = http.createServer(app);
  server.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });
});

after(() => {
  if (server) server.close();
});

describe('Testes de Integração da API & Segurança (HTTP)', () => {

  let adminToken;
  let tecnicoToken;

  test('POST /api/auth/login com credenciais de Admin', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.role, 'admin');
    adminToken = data.token;
  });

  test('POST /api/auth/login com credenciais de Técnico', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tecnico', password: 'tecnico123' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.role, 'tecnico');
    tecnicoToken = data.token;
  });

  test('POST /api/auth/login deve rejeitar senha errada', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'senhaErrada999' })
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('inválidas'));
  });

  test('GET /api/instruments sem token deve retornar 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/instruments`);
    assert.equal(res.status, 401);
  });

  test('GET /api/instruments com token de Técnico deve retornar lista de instrumentos', async () => {
    const res = await fetch(`${baseUrl}/api/instruments`, {
      headers: { Authorization: `Bearer ${tecnicoToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.instruments));
  });

  test('POST /api/instruments com token de Técnico deve permitir cadastro de bancada (HTTP 201)', async () => {
    const res = await fetch(`${baseUrl}/api/instruments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tecnicoToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tag: 'CAL-TEC-001',
        name: 'Multímetro Teste Técnico',
        manufacturer: 'Fluke',
        model: '179',
        range: '0 a 1000V',
        measurand: 'Elétrica',
        typical_points: '10V, 100V, 750V',
        procedure_text: '### ETAPA 1: 🌡️ Aclimatação\nEstabilizar por 2 horas.',
        use_default_photo: 'true'
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.instrument);
    assert.equal(data.instrument.tag, 'CAL-TEC-001');
  });

  test('DELETE /api/instruments/:id com token de Técnico deve retornar 403 Forbidden (Exclusivo ADM)', async () => {
    const res = await fetch(`${baseUrl}/api/instruments/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tecnicoToken}` }
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('restrita'));
  });

  test('POST /api/instruments com Admin mas campos em branco deve travar com 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/instruments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tag: 'CAL-099',
        name: '   ', // Branco!
        manufacturer: 'Fluke',
        model: '87-V'
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('não podem ficar em branco') || data.error.includes('Trava'));
  });

  test('GET /api/users com token de Técnico deve retornar 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${tecnicoToken}` }
    });
    assert.equal(res.status, 403);
  });

  test('GET /api/users com token de Admin deve listar usuários com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.users));
    assert.ok(data.users.some(u => u.username === 'admin'));
    assert.ok(data.users.some(u => u.username === 'tecnico'));
  });

  test('POST /api/ai/autocomplete sem token deve retornar 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/ai/autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturer: 'Fluke', model: '87-V' })
    });
    assert.equal(res.status, 401);
  });

  test('POST /api/ai/autocomplete sem fabricante/modelo deve retornar 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/ai/autocomplete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ manufacturer: '', model: '' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error && data.error.includes('Fabricante'));
  });

  test('POST /api/ai/refine-procedure sem token deve retornar 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/ai/refine-procedure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftText: 'Calibração em 23 graus' })
    });
    assert.equal(res.status, 401);
  });

  test('POST /api/ai/refine-procedure sem draftText deve retornar 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/ai/refine-procedure`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ draftText: '   ' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error && (data.error.includes('em branco') || data.error.includes('calibração')));
  });

  test('POST /api/ai/refine-procedure com texto informal deve reescrever em POP formal ISO 17025', async () => {
    const res = await fetch(`${baseUrl}/api/ai/refine-procedure`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        draftText: 'deixamos na bancada por 2 horas a 23 graus. usamos o calibrador fluke 5522a. testamos os pontos 400mv 4v 40v 400v e 1000v nos bornes de tensao. erro tem que ser menor que 0.05 por cento.',
        manufacturer: 'Fluke',
        model: '87-V',
        measurand: 'Elétrica'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.procedureText);
    assert.ok(typeof data.procedureText === 'string');
    assert.ok(data.procedureText.length > 50);
    // Deve conter seções padronizadas da norma
    assert.ok(
      data.procedureText.includes('Aclimatação') ||
      data.procedureText.includes('Padrão') ||
      data.procedureText.includes('1.') ||
      data.procedureText.includes('Sequência')
    );
  });

});


