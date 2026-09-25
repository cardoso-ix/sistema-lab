const { getDb } = require('./db.js');
const { hashPassword, validateRequiredFields } = require('./security.js');

/**
 * Busca usuário pelo nome de login
 * @param {string} username
 * @returns {object|null}
 */
function findUserByUsername(username) {
  if (!username || typeof username !== 'string') return null;
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username.trim().toLowerCase()) || null;
}

/**
 * Busca usuário pelo ID
 * @param {number} id
 * @returns {object|null}
 */
function findUserById(id) {
  if (!id) return null;
  const db = getDb();
  const stmt = db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?');
  return stmt.get(id) || null;
}

/**
 * Cria um novo usuário (Técnico ou Admin) com validação estrita
 * @param {object} userData
 * @returns {object} Usuário criado sem credenciais
 */
function createUser({ username, name, password, role = 'tecnico' }) {
  const validation = validateRequiredFields({ username, name, password, role }, ['username', 'name', 'password', 'role']);
  if (!validation.isValid) {
    throw new Error(`Campos obrigatórios em branco ou ausentes: ${validation.missingFields.join(', ')}`);
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanName = name.trim();
  const cleanRole = role.trim().toLowerCase();

  if (!['admin', 'tecnico'].includes(cleanRole)) {
    throw new Error('Perfil inválido. Deve ser "admin" ou "tecnico".');
  }

  if (password.length < 4) {
    throw new Error('A senha deve ter no mínimo 4 caracteres.');
  }

  const db = getDb();
  const existing = findUserByUsername(cleanUsername);
  if (existing) {
    throw new Error(`O usuário "${cleanUsername}" já está cadastrado.`);
  }

  const { salt, hash } = hashPassword(password);

  const stmt = db.prepare(`
    INSERT INTO users (username, name, password_salt, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(cleanUsername, cleanName, salt, hash, cleanRole);

  return {
    id: Number(result.lastInsertRowid),
    username: cleanUsername,
    name: cleanName,
    role: cleanRole
  };
}

/**
 * Lista todos os usuários sem expor hashes
 * @returns {object[]}
 */
function listUsers() {
  const db = getDb();
  const stmt = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY name ASC');
  return stmt.all();
}

/**
 * Altera senha de um usuário
 * @param {number} id
 * @param {string} newPassword
 */
function updateUserPassword(id, newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
    throw new Error('A nova senha não pode ser vazia ou em branco.');
  }

  const db = getDb();
  const { salt, hash } = hashPassword(newPassword.trim());
  const stmt = db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?');
  stmt.run(salt, hash, id);
}

/**
 * Exclui um usuário do sistema
 * @param {number} id
 * @returns {boolean}
 */
function deleteUser(id) {
  const db = getDb();
  const user = findUserById(id);
  if (!user) return false;

  // Proteção: Não permitir deletar se for o único admin
  if (user.role === 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "admin"').get();
    if (adminCount.count <= 1) {
      throw new Error('Não é possível excluir o único administrador do sistema.');
    }
  }

  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(id);
  return true;
}

/**
 * Cadastra um instrumento com travas estritas de validação
 * @param {object} data
 * @returns {object} Instrumento cadastrado
 */
function createInstrument(data) {
  const required = [
    'tag',
    'name',
    'manufacturer',
    'model',
    'range',
    'measurand',
    'typical_points',
    'procedure_text'
  ];

  const validation = validateRequiredFields(data, required);
  if (!validation.isValid) {
    throw new Error(`Campos obrigatórios em branco ou ausentes: ${validation.missingFields.join(', ')}`);
  }

  // Trava para foto obrigatória
  if (!data.photo_filename || typeof data.photo_filename !== 'string' || data.photo_filename.trim().length === 0) {
    throw new Error('A foto do instrumento é obrigatória para identificação visual na bancada.');
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO instruments (
      tag, name, manufacturer, model, range, measurand,
      typical_points, procedure_text, photo_filename,
      certificate_filename, manual_filename, procedure_filename,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.tag.trim(),
    data.name.trim(),
    data.manufacturer.trim(),
    data.model.trim(),
    data.range.trim(),
    data.measurand.trim(),
    data.typical_points.trim(),
    data.procedure_text.trim(),
    data.photo_filename.trim(),
    data.certificate_filename ? data.certificate_filename.trim() : null,
    data.manual_filename ? data.manual_filename.trim() : null,
    data.procedure_filename ? data.procedure_filename.trim() : null,
    data.created_by ? data.created_by.trim() : 'sistema'
  );

  return getInstrumentById(Number(result.lastInsertRowid));
}

/**
 * Busca instrumento pelo ID
 * @param {number} id
 * @returns {object|null}
 */
function getInstrumentById(id) {
  if (!id) return null;
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM instruments WHERE id = ?');
  return stmt.get(id) || null;
}

/**
 * Lista instrumentos com filtros de busca
 * @param {object} filters
 * @returns {object[]}
 */
function listInstruments(filters = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM instruments WHERE 1=1';
  const params = [];

  if (filters.measurand && filters.measurand.trim() !== '') {
    const m = filters.measurand.trim();
    if (m === 'Massa' || m === 'Massa / Balança') {
      sql += ' AND (measurand = ? OR measurand = ?)';
      params.push('Massa', 'Massa / Balança');
    } else if (m === 'Tempo e Frequência' || m === 'Frequência / Tempo') {
      sql += ' AND (measurand = ? OR measurand = ?)';
      params.push('Tempo e Frequência', 'Frequência / Tempo');
    } else if (m === 'Óptica e Radiação' || m === 'Óptica / Outras') {
      sql += ' AND (measurand = ? OR measurand = ?)';
      params.push('Óptica e Radiação', 'Óptica / Outras');
    } else {
      sql += ' AND measurand = ?';
      params.push(m);
    }
  }

  if (filters.query && filters.query.trim() !== '') {
    const term = `%${filters.query.trim()}%`;
    sql += ' AND (name LIKE ? OR model LIKE ? OR manufacturer LIKE ? OR tag LIKE ? OR typical_points LIKE ?)';
    params.push(term, term, term, term, term);
  }

  sql += ' ORDER BY name ASC';
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

/**
 * Atualiza os dados de um instrumento com travas de campos em branco
 * @param {number} id
 * @param {object} updates
 * @returns {object} Instrumento atualizado
 */
function updateInstrument(id, updates) {
  const current = getInstrumentById(id);
  if (!current) {
    throw new Error('Instrumento não encontrado.');
  }

  // Verifica se nenhum dos campos enviados está em branco
  for (const [key, val] of Object.entries(updates)) {
    if (typeof val === 'string' && val.trim().length === 0) {
      // Campos essenciais não podem ser esvaziados
      const essential = ['name', 'manufacturer', 'model', 'range', 'measurand', 'typical_points', 'procedure_text', 'photo_filename'];
      if (essential.includes(key)) {
        throw new Error(`O campo "${key}" não pode ser deixado em branco.`);
      }
    }
  }

  const merged = {
    tag: updates.tag !== undefined ? updates.tag.trim() : current.tag,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    manufacturer: updates.manufacturer !== undefined ? updates.manufacturer.trim() : current.manufacturer,
    model: updates.model !== undefined ? updates.model.trim() : current.model,
    range: updates.range !== undefined ? updates.range.trim() : current.range,
    measurand: updates.measurand !== undefined ? updates.measurand.trim() : current.measurand,
    typical_points: updates.typical_points !== undefined ? updates.typical_points.trim() : current.typical_points,
    procedure_text: updates.procedure_text !== undefined ? updates.procedure_text.trim() : current.procedure_text,
    photo_filename: updates.photo_filename !== undefined ? updates.photo_filename.trim() : current.photo_filename,
    certificate_filename: updates.certificate_filename !== undefined ? (updates.certificate_filename ? updates.certificate_filename.trim() : null) : current.certificate_filename,
    manual_filename: updates.manual_filename !== undefined ? (updates.manual_filename ? updates.manual_filename.trim() : null) : current.manual_filename,
    procedure_filename: updates.procedure_filename !== undefined ? (updates.procedure_filename ? updates.procedure_filename.trim() : null) : current.procedure_filename
  };

  const db = getDb();
  const stmt = db.prepare(`
    UPDATE instruments SET
      tag = ?, name = ?, manufacturer = ?, model = ?, range = ?, measurand = ?,
      typical_points = ?, procedure_text = ?, photo_filename = ?,
      certificate_filename = ?, manual_filename = ?, procedure_filename = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    merged.tag, merged.name, merged.manufacturer, merged.model, merged.range, merged.measurand,
    merged.typical_points, merged.procedure_text, merged.photo_filename,
    merged.certificate_filename, merged.manual_filename, merged.procedure_filename,
    id
  );

  return getInstrumentById(id);
}

/**
 * Exclui um instrumento do sistema
 * @param {number} id
 * @returns {boolean}
 */
function deleteInstrument(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM instruments WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  listUsers,
  updateUserPassword,
  deleteUser,
  createInstrument,
  getInstrumentById,
  listInstruments,
  updateInstrument,
  deleteInstrument
};
