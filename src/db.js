const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPassword } = require('./security.js');

let dbInstance = null;

/**
 * Inicializa a conexão com o banco SQLite e cria o schema
 * @param {string} dbPath - Caminho do arquivo ou ':memory:'
 * @returns {DatabaseSync}
 */
function initDatabase(dbPath = null) {
  if (!dbPath) {
    if (process.env.VERCEL) {
      const tmpDir = path.join('/tmp', 'data');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      dbPath = path.join(tmpDir, 'calibhub.db');
    } else {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      dbPath = path.join(dataDir, 'calibhub.db');
    }
  }

  dbInstance = new DatabaseSync(dbPath);

  // Ativa modo WAL em ambiente local ou MEMORY em serverless/memória
  if (dbPath !== ':memory:' && !process.env.VERCEL) {
    dbInstance.exec('PRAGMA journal_mode = WAL;');
  } else {
    dbInstance.exec('PRAGMA journal_mode = MEMORY;');
  }
  dbInstance.exec('PRAGMA foreign_keys = ON;');

  // Criação das tabelas
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'tecnico')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      range TEXT NOT NULL,
      measurand TEXT NOT NULL,
      typical_points TEXT NOT NULL,
      procedure_text TEXT NOT NULL,
      photo_filename TEXT NOT NULL,
      certificate_filename TEXT,
      manual_filename TEXT,
      procedure_filename TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_instruments_model ON instruments(model);
    CREATE INDEX IF NOT EXISTS idx_instruments_manufacturer ON instruments(manufacturer);
    CREATE INDEX IF NOT EXISTS idx_instruments_measurand ON instruments(measurand);
    CREATE INDEX IF NOT EXISTS idx_instruments_tag ON instruments(tag);
  `);

  seedDefaultUsers(dbInstance);
  seedDefaultInstruments(dbInstance);

  return dbInstance;
}

/**
 * Carga inicial de usuários padrão se não existirem
 * @param {DatabaseSync} db
 */
function seedDefaultUsers(db) {
  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const result = checkStmt.get();

  if (result && result.count === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, name, password_salt, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Conta Admin padrão
    const adminPass = hashPassword('admin123');
    insertUser.run('admin', 'Administrador Metrológico', adminPass.salt, adminPass.hash, 'admin');

    // Conta Técnico padrão
    const tecnicoPass = hashPassword('tecnico123');
    insertUser.run('tecnico', 'Técnico de Bancada', tecnicoPass.salt, tecnicoPass.hash, 'tecnico');
  }
}

/**
 * Carga inicial de instrumentos de calibração de demonstração
 * @param {DatabaseSync} db
 */
function seedDefaultInstruments(db) {
  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM instruments');
  const result = checkStmt.get();

  if (result && result.count === 0) {
    const insert = db.prepare(`
      INSERT INTO instruments (
        tag, name, manufacturer, model, range, measurand,
        typical_points, procedure_text, photo_filename,
        certificate_filename, manual_filename, procedure_filename,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Fluke 87-V
    insert.run(
      'CAL-EL-014',
      'Multímetro Digital True-RMS 4½ Dígitos',
      'Fluke Corporation',
      '87-V',
      '0 a 1000V DC/AC, 0 a 10A, 0 a 50MΩ',
      'Elétrica',
      'DCV: 40mV, 400mV, 4V, 40V, 400V, 1000V; ACV: 40V, 400V, 750V (60Hz / 1kHz); DCI: 10mA, 100mA, 1A, 10A; Res: 100Ω, 1kΩ, 10kΩ, 100kΩ, 1MΩ, 10MΩ',
      '1. Estabilizar a UUT na bancada climatizada (23°C ± 2°C) por no mínimo 60 minutos desenergizada.\n2. Conectar cabos nos bornes V e COM com calibrador Fluke 5522A em Standby.\n3. Aplicar pontos em ordem estritamente ascendente.\n4. Aguardar 5 segundos de acomodação por ponto antes de registrar a leitura.\n5. Repetir 3 vezes nas escalas críticas de 10V DC e 10A DC.',
      'fluke_87v.jpg',
      'cert_fluke_87v.pdf',
      'manual_fluke_87v.pdf',
      'pop_multimetro.pdf',
      'admin'
    );

    // 2. WIKA CPG1500
    insert.run(
      'CAL-PR-082',
      'Manômetro Digital Padrão de Alta Exatidão',
      'WIKA Metrologia',
      'CPG1500',
      '0 a 700 bar (0 a 10.000 psi) Relativa',
      'Pressão',
      'Pontos da última calibração: 0 bar (0%), 140 bar (20%), 280 bar (40%), 420 bar (60%), 560 bar (80%), 700 bar (100% FE). Ciclo duplo com espera de 5 min no topo.',
      '1. Montar no manifold hidráulico do gerador de pressão ou balança de pressão.\n2. Purgar o ar do sistema até eliminação total de bolhas.\n3. Aplicar sobrepressão de 105% do fundo de escala por 3 minutos para aliviar tensões do sensor.\n4. Zerar o instrumento na pressão atmosférica.\n5. Realizar ciclo de ida (subida) e ciclo de volta (descida) nos 6 pontos normatizados.',
      'wika_cpg1500.jpg',
      'cert_wika_cpg1500.pdf',
      null,
      null,
      'admin'
    );

    // 3. Fluke 51-II
    insert.run(
      'CAL-TE-033',
      'Termômetro Digital Portátil Termopar',
      'Fluke Corporation',
      'Fluke 51-II',
      '-200°C a +1372°C (Termopar Tipo K)',
      'Temperatura',
      'Pontos simulados eletricamente: -50°C, 0°C, 100°C, 250°C, 500°C, 750°C, 1000°C (Curva ITS-90 com compensação de junta fria desabilitada e habilitada)',
      '1. Conectar a UUT ao Calibrador Fluke 754 através de conector mini-TC com fios de extensão termopar compensados.\n2. Verificar a temperatura ambiente da junta fria no sensor do calibrador.\n3. Simular os potenciais em mV correspondentes a cada ponto da tabela ITS-90.\n4. Anotar os desvios em °C.',
      'fluke_51ii.jpg',
      null,
      null,
      null,
      'admin'
    );

    // 4. Minipa ET-3200
    insert.run(
      'CAL-EL-095',
      'Alicate Amperímetro Digital 1000A AC',
      'Minipa do Brasil',
      'ET-3200',
      '20A, 200A, 1000A AC / 750V AC / 1000V DC',
      'Elétrica',
      'Corrente AC (bobina 50 voltas): 5A, 10A, 50A, 100A, 250A, 500A, 800A, 1000A. Tensão AC: 50V, 220V, 380V, 600V (60Hz).',
      '1. Posicionar a bobina multiplicadora de 50 espiras no centro da garra do alicate.\n2. Garantir fechamento perfeito das faces da garra (livre de poeira ou partículas ferrosas).\n3. Ajustar o calibrador para corrente AC 60Hz e registrar a leitura mantendo o alicate perpendicular ao condutor.',
      'minipa_et3200.jpg',
      null,
      null,
      null,
      'admin'
    );
  }
}

/**
 * Retorna a instância ativa do banco
 * @returns {DatabaseSync}
 */
function getDb() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

module.exports = {
  initDatabase,
  getDb
};
