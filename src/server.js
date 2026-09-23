const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');

const { initDatabase } = require('./db.js');
const { generateMetrologyData, refineProcedureWithAi } = require('./ai.js');
const {
  verifyPassword,
  generateToken,
  verifyToken,
  validateRequiredFields,
  sanitizeFileName,
  generateSecureFileName,
  isAllowedFileExtension
} = require('./security.js');

const {
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
} = require('./models.js');

// Inicializa banco de dados
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Garante que as pastas de upload existem (com suporte a Vercel serverless)
const isVercel = !!process.env.VERCEL;
const baseUploadsDir = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
const photosDir = path.join(baseUploadsDir, 'photos');
const docsDir = path.join(baseUploadsDir, 'docs');
[photosDir, docsDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Se for Vercel, copia as fotos e docs padrão de demonstração para /tmp
if (isVercel) {
  const seedUploads = path.join(__dirname, '..', 'uploads');
  ['photos', 'docs'].forEach(sub => {
    const srcSub = path.join(seedUploads, sub);
    const dstSub = path.join(baseUploadsDir, sub);
    if (fs.existsSync(srcSub)) {
      fs.readdirSync(srcSub).forEach(f => {
        const srcFile = path.join(srcSub, f);
        const dstFile = path.join(dstSub, f);
        if (!fs.existsSync(dstFile)) {
          fs.copyFileSync(srcFile, dstFile);
        }
      });
    }
  });
}

// Configuração do Multer com armazenamento seguro
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'photo') {
      cb(null, photosDir);
    } else {
      cb(null, docsDir);
    }
  },
  filename: (req, file, cb) => {
    cb(null, generateSecureFileName(file.originalname, file.mimetype));
  }
});

const fileFilter = (req, file, cb) => {
  if (!isAllowedFileExtension(file.originalname, file.mimetype)) {
    return cb(new Error('Tipo de arquivo não permitido. Aceitos: Imagens (.jpg, .jpeg, .png, .webp, .jfif, .heic) e Documentos (.pdf, .doc, .docx).'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB máximo por arquivo
  }
});

// ============================================================
// PADRÃO DE SEGURANÇA OWASP & METROLOGIA (ISO/IEC 17025)
// ============================================================
app.disable('x-powered-by');

// Rate limiting simples em memória para mitigar força bruta no login
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

function rateLimitLogin(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && record.lockedUntil) {
    if (now < record.lockedUntil) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Muitas tentativas de autenticação. Aguarde ${remainingSeconds}s antes de tentar novamente.`
      });
    }
    loginAttempts.delete(ip);
  }
  next();
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
  loginAttempts.set(ip, record);
}

function recordSuccessfulLogin(ip) {
  loginAttempts.delete(ip);
}

// Cabeçalhos de Segurança Padrão
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'");
  next();
});

// Middlewares básicos
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Middleware de extração de Token de Autenticação
app.use((req, res, next) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['cookie']) {
    const cookies = req.headers['cookie'].split(';');
    for (const c of cookies) {
      const [key, val] = c.trim().split('=');
      if (key === 'calibhub_token') {
        token = val;
        break;
      }
    }
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
});

// Middleware de autenticação obrigatória
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
  }
  next();
}

// Middleware de perfil de Administrador obrigatório
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ação restrita aos Administradores do laboratório.' });
  }
  next();
}

// ----------------------------------------------------
// ROTAS DE AUTENTICAÇÃO
// ----------------------------------------------------

app.post('/api/auth/login', rateLimitLogin, (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const { username, password } = req.body;

  const validation = validateRequiredFields({ username, password }, ['username', 'password']);
  if (!validation.isValid) {
    recordFailedLogin(ip);
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios e não podem estar em branco.' });
  }

  const user = findUserByUsername(username);
  if (!user) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique usuário e senha.' });
  }

  const isMatch = verifyPassword(password, user.password_salt, user.password_hash);
  if (!isMatch) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique usuário e senha.' });
  }

  recordSuccessfulLogin(ip);

  const token = generateToken({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role
  });

  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `calibhub_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${isSecure ? '; Secure' : ''}`);

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = findUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `calibhub_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecure ? '; Secure' : ''}`);
  res.json({ message: 'Sessão encerrada com sucesso.' });
});

// ----------------------------------------------------
// ASSISTENTE DE IA METROLÓGICA (DEEPSEEK v4.1 / OPENCODE GO)
// ----------------------------------------------------

app.post('/api/ai/autocomplete', requireAuth, async (req, res) => {
  try {
    const { manufacturer, model, customApiKey } = req.body;
    if (!manufacturer || !manufacturer.trim() || !model || !model.trim()) {
      return res.status(400).json({ error: 'Informe o Fabricante e o Modelo para consultar a IA.' });
    }

    const data = await generateMetrologyData({
      manufacturer,
      model,
      customApiKey
    });

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Erro na IA Metrológica:', err.message);
    res.status(400).json({ error: err.message || 'Falha ao consultar assistente de IA.' });
  }
});

// ----------------------------------------------------
// ROTAS DE INSTRUMENTOS (CONSULTA DE BANCADA)
// ----------------------------------------------------

// Listagem e busca com filtros
app.get('/api/instruments', requireAuth, (req, res) => {
  const { query, measurand } = req.query;
  const list = listInstruments({ query, measurand });
  res.json({ instruments: list });
});

// Detalhes completos do instrumento
app.get('/api/instruments/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

  const instrument = getInstrumentById(id);
  if (!instrument) {
    return res.status(404).json({ error: 'Instrumento não encontrado.' });
  }
  res.json({ instrument });
});

// Cadastro de novo instrumento (Técnicos e Administradores com trava contra campos em branco)
const uploadFields = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'certificate', maxCount: 1 },
  { name: 'manual', maxCount: 1 },
  { name: 'procedure', maxCount: 1 }
]);

app.post('/api/instruments', requireAuth, uploadFields, (req, res) => {
  try {
    const {
      tag,
      name,
      manufacturer,
      model,
      range,
      measurand,
      typical_points,
      procedure_text
    } = req.body;

    // Trava de validação para campos de texto
    const required = [
      'tag', 'name', 'manufacturer', 'model', 'range', 'measurand',
      'typical_points', 'procedure_text'
    ];
    const validation = validateRequiredFields(req.body, required);
    if (!validation.isValid) {
      return res.status(400).json({
        error: `Trava de segurança: os seguintes campos não podem ficar em branco: ${validation.missingFields.join(', ')}`
      });
    }

    // Trava de validação para a foto do aparelho (obrigatória!)
    let photoFilename = null;
    if (req.files && req.files.photo && req.files.photo.length > 0) {
      photoFilename = req.files.photo[0].filename;
    } else if (req.body.use_default_photo === 'true' || req.body.photo_filename) {
      photoFilename = req.body.photo_filename || 'default_instrument.jpg';
    } else {
      return res.status(400).json({
        error: 'Trava de segurança: A foto do instrumento é obrigatória para a validação visual na bancada.'
      });
    }

    const certFilename = req.files && req.files.certificate ? req.files.certificate[0].filename : null;
    const manualFilename = req.files && req.files.manual ? req.files.manual[0].filename : null;
    const procFilename = req.files && req.files.procedure ? req.files.procedure[0].filename : null;

    const instrument = createInstrument({
      tag,
      name,
      manufacturer,
      model,
      range,
      measurand,
      typical_points,
      procedure_text,
      photo_filename: photoFilename,
      certificate_filename: certFilename,
      manual_filename: manualFilename,
      procedure_filename: procFilename,
      created_by: req.user.username
    });

    res.status(201).json({
      message: 'Instrumento cadastrado com sucesso!',
      instrument
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Atualização de instrumento (Técnicos e Administradores)
app.put('/api/instruments/:id', requireAuth, uploadFields, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const current = getInstrumentById(id);
    if (!current) {
      return res.status(404).json({ error: 'Instrumento não encontrado.' });
    }

    const updates = { ...req.body };

    // Se novos arquivos foram enviados, atualiza o nome do arquivo
    if (req.files) {
      if (req.files.photo && req.files.photo[0]) {
        updates.photo_filename = req.files.photo[0].filename;
      }
      if (req.files.certificate && req.files.certificate[0]) {
        updates.certificate_filename = req.files.certificate[0].filename;
      }
      if (req.files.manual && req.files.manual[0]) {
        updates.manual_filename = req.files.manual[0].filename;
      }
      if (req.files.procedure && req.files.procedure[0]) {
        updates.procedure_filename = req.files.procedure[0].filename;
      }
    }

    const updated = updateInstrument(id, updates);
    res.json({
      message: 'Instrumento atualizado com sucesso!',
      instrument: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Exclusão de instrumento (Exclusivo ADM)
app.delete('/api/instruments/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

  const deleted = deleteInstrument(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Instrumento não encontrado ou já excluído.' });
  }

  res.json({ message: 'Instrumento excluído com sucesso.' });
});

// ----------------------------------------------------
// ASSISTENTE DE IA METROLÓGICA (DEEPSEEK v4.1 / OPENCODE GO)
// ----------------------------------------------------

app.post('/api/ai/autocomplete', requireAuth, async (req, res) => {
  try {
    const { manufacturer, model, apiKey } = req.body;
    if (!manufacturer || !manufacturer.trim() || !model || !model.trim()) {
      return res.status(400).json({
        error: 'Fabricante e Modelo são obrigatórios para consulta da IA.'
      });
    }

    console.log(`[CalibHub AI] Nova consulta recebida: "${manufacturer.trim()}" "${model.trim()}"`);

    const aiData = await generateMetrologyData({
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      customApiKey: apiKey || null
    });

    console.log(`[CalibHub AI] Sucesso para "${manufacturer}" "${model}" -> "${aiData.name}" (${aiData.measurand})`);

    res.json({
      message: 'Especificações metrológicas geradas com sucesso pelo DeepSeek v4.1!',
      data: aiData
    });
  } catch (err) {
    console.error(`[CalibHub AI Error] Falha na consulta para "${req.body.manufacturer}" "${req.body.model}":`, err.message);
    res.status(502).json({
      error: `Falha na consulta ao assistente DeepSeek v4.1: ${err.message}`
    });
  }
});

// Aprimoramento de Procedimento POP com IA (áudio/notas informais -> POP ISO/IEC 17025)
app.post('/api/ai/refine-procedure', requireAuth, async (req, res) => {
  try {
    const { draftText, manufacturer, model, measurand, apiKey } = req.body;
    if (!draftText || typeof draftText !== 'string' || !draftText.trim()) {
      return res.status(400).json({
        error: 'O texto ou áudio da calibração não pode estar em branco.'
      });
    }

    console.log(`[CalibHub AI] Aprimorando procedimento POP (${draftText.length} caracteres)...`);

    const procedureText = await refineProcedureWithAi({
      draftText: draftText.trim(),
      manufacturer: manufacturer ? manufacturer.trim() : '',
      model: model ? model.trim() : '',
      measurand: measurand ? measurand.trim() : '',
      customApiKey: apiKey || null
    });

    console.log(`[CalibHub AI] POP aprimorado com sucesso (${procedureText.length} caracteres)`);

    res.json({
      message: 'Procedimento Operacional Padrão aprimorado com sucesso pela IA!',
      procedureText
    });
  } catch (err) {
    console.error('[CalibHub AI Error] Falha ao aprimorar procedimento:', err.message);
    res.status(500).json({
      error: `Falha ao aprimorar procedimento: ${err.message}`
    });
  }
});

// ----------------------------------------------------
// ROTAS DE GESTÃO DE USUÁRIOS (EXCLUSIVO ADM)
// ----------------------------------------------------

app.get('/api/users', requireAdmin, (req, res) => {
  res.json({ users: listUsers() });
});

app.post('/api/users', requireAdmin, (req, res) => {
  try {
    const { username, name, password, role } = req.body;
    const user = createUser({ username, name, password, role });
    res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id/password', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { password } = req.body;
    updateUserPassword(id, password);
    res.json({ message: 'Senha atualizada com sucesso.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    deleteUser(id);
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// SERVIÇO SEGURO DE ARQUIVOS (PREVENÇÃO DE PATH TRAVERSAL)
// ----------------------------------------------------

app.get('/uploads/photos/:filename', requireAuth, (req, res) => {
  const safeName = sanitizeFileName(req.params.filename);
  const filePath = path.join(photosDir, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Foto não encontrada.' });
  }
  res.sendFile(filePath);
});

app.get('/uploads/docs/:filename', requireAuth, (req, res) => {
  const safeName = sanitizeFileName(req.params.filename);
  const filePath = path.join(docsDir, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Documento não encontrado.' });
  }

  // Permite visualização inline de PDF no navegador
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.sendFile(filePath);
});

// Tratamento global de erros para retornar JSON estruturado
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[CalibHub Error]', err.message);
  res.status(err.status || 400).json({ error: err.message || 'Erro no processamento da requisição.' });
});

// Arquivos estáticos do Frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Inicia servidor apenas se for executado diretamente
if (require.main === module) {
  const os = require('node:os');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CalibHub] Servidor rodando com sucesso em http://localhost:${PORT}`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`[CalibHub] Acesso pelo celular (mesma rede Wi-Fi): http://${net.address}:${PORT}`);
        }
      }
    }
  });
}

module.exports = app;
