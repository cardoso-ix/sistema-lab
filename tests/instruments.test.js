const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Usamos um banco temporário em memória para isolar os testes
const { initDatabase, getDb } = require('../src/db.js');
const {
  createUser,
  findUserByUsername,
  createInstrument,
  listInstruments,
  getInstrumentById,
  updateInstrument,
  deleteInstrument
} = require('../src/models.js');

describe('Camada de Dados & Regras de Negócio de Calibração', () => {

  before(() => {
    initDatabase(':memory:');
  });

  describe('Gestão de Usuários e Perfis', () => {
    test('deve inicializar com usuários padrão (admin e tecnico)', () => {
      const admin = findUserByUsername('admin');
      const tecnico = findUserByUsername('tecnico');

      assert.ok(admin, 'Usuário admin deve existir');
      assert.equal(admin.role, 'admin');

      assert.ok(tecnico, 'Usuário tecnico deve existir');
      assert.equal(tecnico.role, 'tecnico');
    });

    test('deve criar novo técnico com senha segura e perfil correto', () => {
      const newUser = createUser({
        username: 'carlos_silva',
        name: 'Carlos Silva',
        password: 'senhaTecnico123',
        role: 'tecnico'
      });

      assert.ok(newUser.id, 'Deve retornar o ID criado');
      assert.equal(newUser.username, 'carlos_silva');
      assert.equal(newUser.role, 'tecnico');
      assert.ok(!newUser.password, 'Nunca deve retornar a senha em texto claro');

      const found = findUserByUsername('carlos_silva');
      assert.ok(found);
      assert.equal(found.name, 'Carlos Silva');
    });

    test('deve travar criação de usuário com campos em branco ou perfil inválido', () => {
      assert.throws(() => {
        createUser({
          username: '   ',
          name: 'Nome',
          password: '123',
          role: 'tecnico'
        });
      }, /obrigatorio|branco/i);

      assert.throws(() => {
        createUser({
          username: 'user_invalido',
          name: 'Nome',
          password: '123',
          role: 'hacker' // Perfil não permitido
        });
      }, /perfil inv[aá]lido/i);
    });
  });

  describe('Instrumentos de Calibração (Ficha de Bancada)', () => {
    let createdId;

    test('deve cadastrar instrumento quando todos os campos obrigatórios e foto estão presentes', () => {
      const instrument = createInstrument({
        tag: 'CAL-EL-001',
        name: 'Multímetro Digital de Precisão',
        manufacturer: 'Fluke',
        model: '87-V',
        range: '0 a 1000V DC/AC, 0 a 10A, 0 a 50MΩ',
        measurand: 'Elétrica',
        typical_points: 'DCV: 0.1V, 1V, 10V, 100V, 1000V; ACV: 10V (60Hz e 1kHz), 100V, 750V; DCI: 10mA, 100mA, 1A, 10A',
        procedure_text: '1. Estabilizar termicamente o padrão e a UUT por 1h a 23°C ± 2°C.\n2. Conectar cabos nos bornes V e COM.\n3. Aplicar pontos ascendentes e registrar valores.',
        photo_filename: 'fluke_87v_sample.jpg',
        certificate_filename: 'cert_anterior_001.pdf',
        manual_filename: 'manual_fluke_87v.pdf',
        procedure_filename: 'pop_cal_012.pdf',
        created_by: 'admin'
      });

      assert.ok(instrument.id, 'ID deve ser gerado');
      createdId = instrument.id;
      assert.equal(instrument.model, '87-V');
      assert.equal(instrument.manufacturer, 'Fluke');
      assert.ok(instrument.photo_filename, 'Foto deve estar presente');
    });

    test('deve travar o salvamento se qualquer campo obrigatório estiver em branco', () => {
      // Teste sem foto
      assert.throws(() => {
        createInstrument({
          tag: 'CAL-002',
          name: 'Manômetro',
          manufacturer: 'Wika',
          model: '232.50',
          range: '0 a 100 bar',
          measurand: 'Pressão',
          typical_points: '0, 25, 50, 75, 100 bar',
          procedure_text: 'Aplicar pressão crescente',
          photo_filename: '' // Vazio! Deve travar
        });
      }, /foto.*obrigat[oó]ri/i);

      // Teste com modelo em branco
      assert.throws(() => {
        createInstrument({
          tag: 'CAL-003',
          name: 'Termômetro',
          manufacturer: 'Fluke',
          model: '   ', // Espaços! Deve travar
          range: '-50 a 1300°C',
          measurand: 'Temperatura',
          typical_points: '0°C, 50°C, 100°C',
          procedure_text: 'Banho térmico',
          photo_filename: 'termo.jpg'
        });
      }, /obrigatorio|branco/i);
    });

    test('deve buscar instrumentos por modelo, fabricante ou grandeza', () => {
      const all = listInstruments();
      assert.ok(all.length >= 1);

      const byModel = listInstruments({ query: '87-V' });
      assert.ok(byModel.length >= 1);
      assert.ok(byModel[0].model.includes('87-V'));

      const byMeasurand = listInstruments({ measurand: 'Elétrica' });
      assert.ok(byMeasurand.length >= 1);
      assert.equal(byMeasurand[0].measurand, 'Elétrica');

      const byNotFound = listInstruments({ query: 'InstrumentoInexistenteXYZ' });
      assert.equal(byNotFound.length, 0);
    });

    test('deve recuperar a ficha completa com pontos e anexos pelo ID', () => {
      const item = getInstrumentById(createdId);
      assert.ok(item);
      assert.equal(item.id, createdId);
      assert.ok(item.typical_points.includes('DCV: 0.1V'));
      assert.equal(item.photo_filename, 'fluke_87v_sample.jpg');
      assert.equal(item.certificate_filename, 'cert_anterior_001.pdf');
    });

    test('deve atualizar dados do instrumento preservando validação', () => {
      const updated = updateInstrument(createdId, {
        typical_points: 'DCV: 1V, 10V, 100V, 1000V (Ajustado)',
        procedure_text: 'Procedimento revisado e validado'
      });
      assert.ok(updated.typical_points.includes('(Ajustado)'));

      // Tentar atualizar campo obrigatório para branco deve travar
      assert.throws(() => {
        updateInstrument(createdId, {
          model: '  ' // Vazio
        });
      }, /obrigatorio|branco/i);
    });

    test('deve excluir instrumento com sucesso', () => {
      const deleted = deleteInstrument(createdId);
      assert.equal(deleted, true);

      const search = getInstrumentById(createdId);
      assert.equal(search, null);
    });
  });

});
