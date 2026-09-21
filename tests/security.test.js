const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  validateRequiredFields,
  sanitizeFileName,
  isAllowedFileExtension
} = require('../src/security.js');

describe('Módulo de Segurança e Validação Estrita', () => {

  describe('Criptografia e Senhas (scrypt + salt)', () => {
    test('deve gerar hash e verificar a senha correta com sucesso', () => {
      const { salt, hash } = hashPassword('senhaForte123!');
      assert.ok(salt && salt.length >= 32, 'Salt deve ter tamanho seguro');
      assert.ok(hash && hash.length >= 64, 'Hash deve ter tamanho seguro');

      const isValid = verifyPassword('senhaForte123!', salt, hash);
      assert.equal(isValid, true, 'Senha correta deve ser validada');
    });

    test('deve rejeitar senha incorreta', () => {
      const { salt, hash } = hashPassword('senhaOriginal');
      const isValid = verifyPassword('senhaErrada', salt, hash);
      assert.equal(isValid, false, 'Senha incorreta deve retornar false');
    });

    test('deve gerar salts diferentes para a mesma senha (anti-rainbow table)', () => {
      const h1 = hashPassword('mesmaSenha');
      const h2 = hashPassword('mesmaSenha');
      assert.notEqual(h1.salt, h2.salt, 'Salts devem ser distintos para cada hash');
      assert.notEqual(h1.hash, h2.hash, 'Hashes devem ser distintos devido ao salt aleatório');
    });
  });

  describe('Tokens de Sessão Assinados (HMAC-SHA256)', () => {
    test('deve gerar e verificar token válido com payload', () => {
      const payload = { userId: 1, role: 'admin', username: 'admin' };
      const token = generateToken(payload, 3600); // 1 hora
      assert.ok(typeof token === 'string' && token.includes('.'));

      const verified = verifyToken(token);
      assert.ok(verified, 'Token válido deve ser verificado');
      assert.equal(verified.userId, 1);
      assert.equal(verified.role, 'admin');
    });

    test('deve rejeitar token adulterado (tampered)', () => {
      const token = generateToken({ userId: 2, role: 'tecnico' }, 3600);
      const parts = token.split('.');
      // Modifica o payload codificado
      const tamperedToken = parts[0] + 'x.' + parts[1];
      const verified = verifyToken(tamperedToken);
      assert.equal(verified, null, 'Token adulterado deve ser rejeitado');
    });

    test('deve rejeitar token expirado', () => {
      // Cria token expirado no passado (-10 segundos)
      const token = generateToken({ userId: 3 }, -10);
      const verified = verifyToken(token);
      assert.equal(verified, null, 'Token expirado deve ser rejeitado');
    });
  });

  describe('Travas contra Campos em Branco (Validação Estrita)', () => {
    test('deve aprovar quando todos os campos obrigatórios contêm conteúdo real', () => {
      const data = {
        name: 'Multímetro Fluke 87V',
        manufacturer: 'Fluke',
        model: '87V',
        range: '0 a 1000V',
        typical_points: '10V, 100V, 500V, 1000V',
        procedure_text: 'Conectar aos bornes V e COM...'
      };
      const required = ['name', 'manufacturer', 'model', 'range', 'typical_points', 'procedure_text'];
      const result = validateRequiredFields(data, required);
      assert.equal(result.isValid, true);
      assert.equal(result.missingFields.length, 0);
    });

    test('deve reprovar quando campo está ausente, nulo ou indefinido', () => {
      const data = {
        name: 'Manômetro',
        manufacturer: null,
        model: undefined
      };
      const result = validateRequiredFields(data, ['name', 'manufacturer', 'model', 'range']);
      assert.equal(result.isValid, false);
      assert.ok(result.missingFields.includes('manufacturer'));
      assert.ok(result.missingFields.includes('model'));
      assert.ok(result.missingFields.includes('range'));
    });

    test('deve travar e reprovar quando campo contém apenas espaços em branco', () => {
      const data = {
        name: '   ',
        manufacturer: '   \t  \n  ',
        model: 'Valido'
      };
      const result = validateRequiredFields(data, ['name', 'manufacturer', 'model']);
      assert.equal(result.isValid, false);
      assert.ok(result.missingFields.includes('name'));
      assert.ok(result.missingFields.includes('manufacturer'));
      assert.equal(result.missingFields.includes('model'), false);
    });
  });

  describe('Segurança de Nomes de Arquivo e Path Traversal', () => {
    test('deve validar extensões permitidas de foto e documentos', () => {
      assert.equal(isAllowedFileExtension('foto.jpg'), true);
      assert.equal(isAllowedFileExtension('manual.PDF'), true);
      assert.equal(isAllowedFileExtension('foto.png'), true);
      assert.equal(isAllowedFileExtension('foto.webp'), true);

      // Rejeitar extensões inseguras
      assert.equal(isAllowedFileExtension('script.exe'), false);
      assert.equal(isAllowedFileExtension('malware.sh'), false);
      assert.equal(isAllowedFileExtension('shell.php'), false);
      assert.equal(isAllowedFileExtension('semextensao'), false);
    });

    test('deve sanitizar nomes e neutralizar tentativas de Directory Traversal', () => {
      const maliciousNames = [
        '../../etc/passwd.pdf',
        '..\\..\\windows\\system32.jpg',
        '/root/secret.png',
        'foo/bar/test.pdf'
      ];

      for (const name of maliciousNames) {
        const safe = sanitizeFileName(name);
        assert.ok(!safe.includes('/'), `Nome seguro não pode conter barras: ${safe}`);
        assert.ok(!safe.includes('\\'), `Nome seguro não pode conter barras invertidas: ${safe}`);
        assert.ok(!safe.includes('..'), `Nome seguro não pode conter dois pontos (traversal): ${safe}`);
      }
    });
  });

});
