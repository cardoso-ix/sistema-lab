const crypto = require('node:crypto');
const path = require('node:path');

// Chave secreta interna para assinatura de tokens de sessão
const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * Gera hash de senha criptograficamente seguro com scrypt e salt aleatório
 * @param {string} password
 * @returns {{ salt: string, hash: string }}
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('A senha deve ser uma string não vazia.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

/**
 * Valida a senha contra o hash e salt armazenados usando comparação em tempo constante
 * @param {string} password
 * @param {string} salt
 * @param {string} expectedHash
 * @returns {boolean}
 */
function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  try {
    const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (computedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Gera um token de sessão assinado com HMAC-SHA256
 * @param {object} payload
 * @param {number} expiresInSeconds
 * @returns {string} token
 */
function generateToken(payload, expiresInSeconds = 86400) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifica e decodifica um token assinado
 * @param {string} token
 * @returns {object|null} payload decodificado ou null se inválido/expirado
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expirado
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Trava estrita contra campos em branco, nulos ou com apenas espaços
 * @param {object} data
 * @param {string[]} requiredFields
 * @returns {{ isValid: boolean, missingFields: string[] }}
 */
function validateRequiredFields(data, requiredFields = []) {
  const missingFields = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, missingFields: requiredFields };
  }

  for (const field of requiredFields) {
    const value = data[field];

    if (value === undefined || value === null) {
      missingFields.push(field);
      continue;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      missingFields.push(field);
      continue;
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.jfif', '.heic', '.heif', '.bmp', '.tiff', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'
];

const DANGEROUS_EXTENSIONS = [
  '.exe', '.sh', '.php', '.bat', '.cmd', '.js', '.py', '.vbs', '.msi', '.com', '.scr', '.ps1'
];

/**
 * Verifica se a extensão ou mimetype do arquivo é permitido para fotos de bancada ou documentos anexos
 * @param {string} filename
 * @param {string} [mimetype]
 * @returns {boolean}
 */
function isAllowedFileExtension(filename, mimetype = '') {
  if (!filename || typeof filename !== 'string') return false;

  const base = path.basename(filename).toLowerCase().trim();
  const ext = path.extname(base).toLowerCase();

  // Bloqueio rigoroso de scripts e executáveis
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return false;
  }

  // Se tem extensão válida cadastrada
  if (ext && ALLOWED_EXTENSIONS.includes(ext)) {
    return true;
  }

  // Tratamento especial para uploads de câmera/canvas sem extensão (ex: 'blob' ou 'image')
  if ((!ext || base === 'blob' || base.startsWith('blob.')) && mimetype) {
    const mime = mimetype.toLowerCase().trim();
    if (mime.startsWith('image/') || mime === 'application/pdf' || mime.includes('document') || mime.includes('sheet')) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitiza o nome do arquivo para prevenir Directory Traversal
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFileName(filename) {
  if (!filename) return '';
  // Extrai apenas o nome base sem diretórios
  let base = path.basename(filename);
  // Remove pontos duplos e caracteres perigosos
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  base = base.replace(/\.\.+/g, '.');
  return base;
}

/**
 * Gera um nome seguro e único com UUID preservando ou inferindo a extensão válida
 * @param {string} originalName
 * @param {string} [mimetype]
 * @returns {string}
 */
function generateSecureFileName(originalName, mimetype = '') {
  let ext = path.extname(originalName || '').toLowerCase().trim();

  // Se não tem extensão ou veio como 'blob' da câmera/canvas
  if (!ext || originalName === 'blob') {
    if (mimetype) {
      const mime = mimetype.toLowerCase();
      if (mime.includes('png')) ext = '.png';
      else if (mime.includes('webp')) ext = '.webp';
      else if (mime.includes('pdf')) ext = '.pdf';
      else if (mime.includes('heic')) ext = '.heic';
      else ext = '.jpg';
    } else {
      ext = '.jpg';
    }
  }

  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  validateRequiredFields,
  isAllowedFileExtension,
  sanitizeFileName,
  generateSecureFileName
};
