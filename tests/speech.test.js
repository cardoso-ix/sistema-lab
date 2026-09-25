const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { deduplicateSpeechText } = require('../src/ai.js');

describe('Higienização e Deduplicação Inteligente de Transcrição de Áudio', () => {

  test('deve retornar string vazia para entradas nulas, indefinidas ou vazias', () => {
    assert.equal(deduplicateSpeechText(''), '');
    assert.equal(deduplicateSpeechText(null), '');
    assert.equal(deduplicateSpeechText(undefined), '');
    assert.equal(deduplicateSpeechText('   '), '');
  });

  test('deve eliminar repetições consecutivas de uma única palavra (gaguejo do operador)', () => {
    const input = 'foi feita a calibração calibração com o multímetro multímetro na bancada bancada';
    const expected = 'foi feita a calibração com o multímetro na bancada';
    assert.equal(deduplicateSpeechText(input), expected);
  });

  test('deve eliminar repetições múltiplas (> 2 vezes) da mesma palavra', () => {
    const input = 'aplicamos 10V 10V 10V 10V nos bornes bornes bornes principais';
    const expected = 'aplicamos 10V nos bornes principais';
    assert.equal(deduplicateSpeechText(input), expected);
  });

  test('deve eliminar repetições de frases curtas de 2 palavras', () => {
    const input = 'iniciamos o ensaio na bancada na bancada a 23 graus a 23 graus';
    const expected = 'iniciamos o ensaio na bancada a 23 graus';
    assert.equal(deduplicateSpeechText(input), expected);
  });

  test('deve eliminar repetições de frases longas de 3 a 8 palavras (eco/loop de microfone)', () => {
    const input = 'foi feita a calibração foi feita a calibração com o calibrador Fluke 5522A';
    const expected = 'foi feita a calibração com o calibrador Fluke 5522A';
    assert.equal(deduplicateSpeechText(input), expected);
  });

  test('deve preservar palavras idênticas legítimas que não são consecutivas', () => {
    const input = 'medimos a tensão na entrada e depois medimos a tensão na saída';
    const expected = 'medimos a tensão na entrada e depois medimos a tensão na saída';
    assert.equal(deduplicateSpeechText(input), expected);
  });

  test('deve suportar caracteres acentuados da língua portuguesa (ã, ç, é, ô)', () => {
    const input = 'estabilização térmica estabilização térmica e verificação de medição medição';
    const expected = 'estabilização térmica e verificação de medição';
    assert.equal(deduplicateSpeechText(input), expected);
  });
});
