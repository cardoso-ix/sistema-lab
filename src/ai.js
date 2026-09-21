/**
 * CALIBHUB PRO - MÓDULO DE IA METROLÓGICA (DEEPSEEK v4.1 via OPENCODE GO)
 * Assistente para autocompletar especificações, faixas e roteiros POP segundo ISO/IEC 17025
 */

const OPENCODE_ENDPOINT = process.env.OPENCODE_ENDPOINT || 'https://opencode.ai/zen/go/v1/chat/completions';
const DEFAULT_API_KEY = process.env.OPENCODE_API_KEY || 'sk-TXRnai26pRuAqF5Kvdwm2ACWl8kjxx76wiqNMQ3TMrw4ImHpaklzJLMlX7Dl0v1m';
const DEFAULT_MODEL = process.env.OPENCODE_MODEL || 'deepseek-v4.1-flash';

/**
 * Consulta o DeepSeek v4.1 para gerar ficha técnica e procedimento de calibração
 * @param {object} params
 * @param {string} params.manufacturer - Fabricante do instrumento (ex: Fluke, Wika, Mitutoyo)
 * @param {string} params.model - Modelo do instrumento (ex: 87-V, 232.50, 500-196)
 * @param {string} [params.customApiKey] - Chave opcional informada pelo usuário
 * @returns {Promise<object>}
 */
async function generateMetrologyData({ manufacturer, model, customApiKey = null }) {
  if (!manufacturer || !manufacturer.trim()) {
    throw new Error('Informe o fabricante do instrumento.');
  }
  if (!model || !model.trim()) {
    throw new Error('Informe o modelo do instrumento.');
  }

  const apiKey = customApiKey || DEFAULT_API_KEY;

  const prompt = `Você é um Engenheiro Metrologista Sênior e Auditor Técnico ABNT NBR ISO/IEC 17025.
Sua tarefa é LOCALIZAR E IDENTIFICAR O INSTRUMENTO DE MEDIÇÃO utilizando EXCLUSIVAMENTE como base o Fabricante e o Modelo informados abaixo:

- FABRICANTE: "${manufacturer.trim()}"
- MODELO: "${model.trim()}"

A partir do Fabricante e Modelo, localize as especificações técnicas oficiais de fábrica na internet e documentações metrológicas. Identifique exatamente a que instrumento esse modelo se refere, sua grandeza metrológica, suas faixas de trabalho e elabore o procedimento de calibração padronizado.

Retorne ESTRITAMENTE um objeto JSON válido (sem blocos markdown adicionais ou texto explicativo antes ou depois) contendo obrigatoriamente as seguintes chaves:
{
  "name": "Nome técnico formal completo do instrumento localizado (ex: Multímetro Digital Industrial True-RMS, Manômetro de Pressão Tubo de Bourdon, Termômetro Digital com Sonda PT100)",
  "measurand": "Escolha exatamente uma opção dentre estas: Elétrica, Pressão, Temperatura, Dimensional, Massa / Balança, Frequência / Tempo, Óptica / Outras",
  "range": "Faixas de medição nominais detalhadas e resolução de fábrica para o modelo ${model.trim()}",
  "typical_points": "Pontos nominais recomendados para a malha de calibração na bancada (especificar valores de teste numéricos reais para as escalas principais)",
  "procedure_text": "Roteiro Operacional Padrão (POP) passo a passo detalhado para o técnico executar na bancada:\\n1. Aclimatação e estabilização térmica (tempo e temperatura nominal)\\n2. Inspeção física, verificação de baterias/fusíveis e conexões corretas nos bornes/tomadas\\n3. Padrão de trabalho recomendado (ex: calibrador multifunção, balança de pressão, etc.)\\n4. Sequência de aplicação dos pontos ascendentes e descendentes com tempos de estabilização\\n5. Critérios de aceitação e tolerâncias recomendadas segundo especificações de fábrica"
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos timeout

  try {
    const response = await fetch(OPENCODE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-opencode-session': `calibhub-ai-${Date.now()}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      let msg = `Erro da API de IA (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error && errJson.error.message) msg = errJson.error.message;
      } catch (e) {}
      throw new Error(msg);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Resposta incompleta da API de IA.');
    }

    let rawContent = (
      (data.choices[0].message && data.choices[0].message.content) ||
      (data.choices[0].message && data.choices[0].message.reasoning_content) ||
      ''
    ).trim();

    const parsed = parseAiJsonSafely(rawContent, manufacturer, model);

    // Mapeamento e garantia de grandeza compatível com as opções da aplicação
    const validMeasurands = [
      'Elétrica',
      'Pressão',
      'Temperatura',
      'Dimensional',
      'Massa / Balança',
      'Frequência / Tempo',
      'Óptica / Outras'
    ];

    let matchedMeasurand = validMeasurands.find(m => 
      m.toLowerCase() === (parsed.measurand || '').toLowerCase()
    );

    if (!matchedMeasurand) {
      const lower = (parsed.measurand || '').toLowerCase();
      if (lower.includes('elét') || lower.includes('elet')) matchedMeasurand = 'Elétrica';
      else if (lower.includes('press')) matchedMeasurand = 'Pressão';
      else if (lower.includes('temp')) matchedMeasurand = 'Temperatura';
      else if (lower.includes('dimens') || lower.includes('tam')) matchedMeasurand = 'Dimensional';
      else if (lower.includes('massa') || lower.includes('pes') || lower.includes('balan')) matchedMeasurand = 'Massa / Balança';
      else if (lower.includes('freq') || lower.includes('temp') || lower.includes('cron')) matchedMeasurand = 'Frequência / Tempo';
      else matchedMeasurand = 'Óptica / Outras';
    }

    return {
      name: parsed.name || `${manufacturer.trim()} ${model.trim()}`,
      measurand: matchedMeasurand,
      range: parsed.range || 'Consultar manual do fabricante',
      typical_points: parsed.typical_points || 'Conforme especificação metrológica',
      procedure_text: parsed.procedure_text || 'Roteiro gerado pelo assistente metrológico'
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[CalibHub AI Warning] Falha na chamada da API de IA (${err.message}). Ativando gerador metrológico inteligente para ${manufacturer} ${model}...`);
    return generateEmergencyFallback(manufacturer, model);
  }
}

/**
 * Gerador de especificações metrológicas inteligentes segundo ISO/IEC 17025
 * Garante que o auto-preenchimento NUNCA falhe, mesmo se a API estiver fora do ar ou sem internet.
 */
function generateEmergencyFallback(manufacturer, model) {
  const mfg = manufacturer.trim();
  const mdl = model.trim();
  const lower = `${mfg} ${mdl}`.toLowerCase();

  let measurand = 'Elétrica';
  let name = `${mfg} ${mdl} - Instrumento de Bancada`;
  let range = 'Conforme escala nominal de fábrica';
  let typical_points = '0%, 25%, 50%, 75% e 100% da escala de medição';
  let procedure_text = '';

  if (lower.includes('manomet') || lower.includes('wika') || lower.includes('press') || lower.includes('druck') || lower.includes('ashcroft') || lower.includes('bar') || lower.includes('psi')) {
    measurand = 'Pressão';
    name = `Manômetro de Pressão ${mfg} ${mdl}`;
    range = 'Faixa de 0 a 10 bar (ou conforme escala gravada no mostrador)';
    typical_points = '0, 2.5, 5.0, 7.5 e 10.0 bar (ciclos ascendente e descendente)';
    procedure_text = `1. Aclimatação e Estabilização Térmica: Estabilizar o instrumento no laboratório a 20 ± 2 °C com UR entre 45% e 75% por no mínimo 2 horas.\n2. Inspeção Física: Verificar integridade do visor, ponteiro, rosca de conexão e ausência de vazamentos hidráulicos/pneumáticos.\n3. Padrão Recomendado: Balança de pressão (deadweight tester) ou calibrador de pressão digital com relação TUR ≥ 4:1.\n4. Sequência de Aplicação: Iniciar em zero, aplicar pressão nos pontos 0%, 25%, 50%, 75% e 100% do span, aguardar 30s para estabilização da leitura. Repetir o ciclo em ordem descendente (100%, 75%, 50%, 25%, 0%).\n5. Critérios de Aceitação: O erro em cada ponto e a histerese devem ser menores ou iguais ao Erro Máximo Permissível (EMP = Classe de exatidão × Span).`;
  } else if (lower.includes('termomet') || lower.includes('temp') || lower.includes('pt100') || lower.includes('termopar') || lower.includes('novus') || lower.includes('testo')) {
    measurand = 'Temperatura';
    name = `Termômetro / Indicador de Temperatura ${mfg} ${mdl}`;
    range = '-50 °C a 400 °C (ou conforme especificação do sensor)';
    typical_points = '0 °C, 50 °C, 100 °C, 150 °C e 200 °C';
    procedure_text = `1. Aclimatação: Manter o instrumento na temperatura padrão do laboratório (23 ± 2 °C) por 2 horas.\n2. Inspeção: Inspecionar cabos de compensação, bainha do sensor e conexões dos bornes.\n3. Padrão Recomendado: Bloco seco calibrador térmico ou banho termostático com termômetro padrão SPRT rastreável RBC.\n4. Sequência de Ensaio: Inserir o sensor na profundidade correta no bloco, aguardar estabilização do gradiente térmico por no mínimo 10 minutos por ponto e registrar as leituras nos ciclos ascendente e descendente.\n5. Tolerâncias: Desvio máximo permitido conforme especificação de fábrica ou classe ASTM/IEC do sensor.`;
  } else if (lower.includes('paquimetr') || lower.includes('micrometr') || lower.includes('mitutoyo') || lower.includes('dimensional') || lower.includes('relogio')) {
    measurand = 'Dimensional';
    name = `Instrumento Dimensional de Precisão ${mfg} ${mdl}`;
    range = '0 a 150 mm (resolução 0.01 mm / 0.001 mm)';
    typical_points = '0 mm, 25 mm, 50 mm, 75 mm, 100 mm e 150 mm';
    procedure_text = `1. Aclimatação: Manter o instrumento e os blocos-padrão a 20 ± 1 °C por no mínimo 4 horas para estabilização de dilatação térmica.\n2. Inspeção: Limpar as faces de medição com álcool isopropílico e papel especial, verificar paralelismo e zeramento.\n3. Padrão Recomendado: Jogo de Blocos-Padrão de Aço/Cerâmica Classe 1 ou Classe 0 rastreado RBC.\n4. Sequência de Ensaio: Medir os blocos em posição central das faces, aplicando força de medição constante com auxílio da catraca/fricção.\n5. Critérios de Aceitação: Erro de indicação e repetibilidade devem estar dentro das tolerâncias da norma ABNT NBR NM ISO 13385.`;
  } else if (lower.includes('balanca') || lower.includes('peso') || lower.includes('massa') || lower.includes('toledo') || lower.includes('gehaka')) {
    measurand = 'Massa / Balança';
    name = `Balança de Precisão ${mfg} ${mdl}`;
    range = '0 a 2000 g (resolução 0.01 g / 0.1 g)';
    typical_points = '0 g, 200 g, 500 g, 1000 g, 1500 g e 2000 g';
    procedure_text = `1. Aclimatação: Instalar a balança sobre mesa antivibratória, nivelar a bolha de nível e ligar com antecedência de 30 min.\n2. Inspeção: Limpar o prato de pesagem e verificar estabilidade da indicação de zero.\n3. Padrão Recomendado: Conjunto de pesos-padrão Classe F1 ou E2 rastreados RBC/INMETRO.\n4. Sequência de Ensaio: Realizar ensaio de exatidão de carga (ascendente/descendente), ensaio de excentricidade nos 4 quadrantes e ensaio de repetibilidade com 10 repetições.\n5. Tolerâncias: Erro máximo admissível conforme portaria do INMETRO para a classe da balança.`;
  } else {
    // Padrão Elétrica (Fluke, Megabras, Minipa, etc.)
    measurand = 'Elétrica';
    name = `Multímetro / Calibrador Industrial ${mfg} ${mdl}`;
    range = 'Tensões DC/AC até 1000V, Correntes até 10A, Resistência até 50MΩ';
    typical_points = 'DCV: 100mV, 1V, 10V, 100V, 1000V; ACV: 1V, 10V, 100V, 750V; Res: 100Ω, 1kΩ, 10kΩ, 100kΩ, 1MΩ';
    procedure_text = `1. Aclimatação e Estabilização Térmica: Estabilizar o equipamento na bancada a 23 ± 5 °C e UR < 70% por no mínimo 2 horas.\n2. Inspeção Física e Conexões: Verificar condição dos bornes, integridade de fusíveis e cabos com ponta de prova blindada.\n3. Padrão Recomendado: Calibrador multifunção Fluke 5500A/5522A ou padrão rastreável RBC/INMETRO com relação TUR ≥ 4:1.\n4. Sequência de Aplicação: Iniciar pela escala de zero, aplicar os pontos ascendentes conforme typical_points, aguardar 5 segundos para estabilização do conversor A/D e repetir no ciclo descendente.\n5. Critérios de Aceitação: Calcular Erro = Leitura - Valor Aplicado. Comparar com o Erro Máximo Permissível (EMP) especificado no manual do fabricante para 1 ano.`;
  }

  return { name, measurand, range, typical_points, procedure_text };
}

/**
 * Parser resiliente para JSON gerado por modelos de linguagem.
 * Suporta caracteres de controle sem escape e fallback por Regex.
 */
function parseAiJsonSafely(rawContent, manufacturer, model) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Conteúdo retornado pelo assistente de IA está vazio.');
  }

  // 1. Limpeza de marcadores markdown
  let cleaned = rawContent.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 2. Extrai o bloco entre a primeira chave e a última
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // 3. Tentativa 1: Parse direto
  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object') return direct;
  } catch (e1) {
    // 4. Tentativa 2: Sanitização de caracteres de controle (quebras de linha literais dentro de strings)
    try {
      const sanitized = cleaned.replace(/[\u0000-\u001F]+/g, (match) => {
        if (match.includes('\n')) return '\\n';
        if (match.includes('\t')) return '\\t';
        return ' ';
      });
      const parsedSanitized = JSON.parse(sanitized);
      if (parsedSanitized && typeof parsedSanitized === 'object') return parsedSanitized;
    } catch (e2) {
      // 5. Tentativa 3: Extrator resiliente campo a campo via Regex
      const extractField = (field) => {
        const reg = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)(?="\\s*,\\s*"[a-zA-Z_]+|"\\s*\\})`, 'i');
        const m = cleaned.match(reg);
        if (m && m[1]) {
          return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
        }
        return null;
      };

      return {
        name: extractField('name') || `${manufacturer.trim()} ${model.trim()}`,
        measurand: extractField('measurand') || 'Elétrica',
        range: extractField('range') || 'Consultar especificações nominais do fabricante',
        typical_points: extractField('typical_points') || 'Pontos nominais de 0% a 100% da escala',
        procedure_text: extractField('procedure_text') || 'Roteiro Operacional Padrão segundo ABNT NBR ISO/IEC 17025'
      };
    }
  }

  return {
    name: `${manufacturer.trim()} ${model.trim()}`,
    measurand: 'Elétrica',
    range: 'Consultar manual do fabricante',
    typical_points: 'Pontos nominais de calibração',
    procedure_text: 'Roteiro Operacional Padrão'
  };
}

/**
 * Aprimora e padroniza o texto do procedimento metrológico (POP)
 * a partir de relatos de áudio/voz ou anotações informais do técnico.
 * @param {object} params
 * @param {string} params.draftText - Texto falado/digitado informalmente pelo técnico
 * @param {string} [params.manufacturer] - Fabricante do instrumento (opcional)
 * @param {string} [params.model] - Modelo do instrumento (opcional)
 * @param {string} [params.measurand] - Grandeza metrológica (opcional)
 * @param {string} [params.customApiKey] - Chave opcional de API
 * @returns {Promise<string>} Texto formal do POP segundo ISO/IEC 17025
 */
async function refineProcedureWithAi({ draftText, manufacturer = '', model = '', measurand = '', customApiKey = null }) {
  if (!draftText || typeof draftText !== 'string' || !draftText.trim()) {
    throw new Error('Informe ou dite o procedimento para que a IA possa aprimorá-lo.');
  }

  const apiKey = customApiKey || DEFAULT_API_KEY;

  const prompt = `Você é um Engenheiro Metrologista Sênior e Especialista em Procedimentos Operacionais Padrão (POP) segundo a ABNT NBR ISO/IEC 17025.
O técnico de laboratório forneceu o seguinte relato (transcrito de áudio ou anotações informais de bancada) explicando como realizou a calibração:

---
RELATO DO TÉCNICO:
"${draftText.trim()}"
---
CONTEXTO DO INSTRUMENTO:
Fabricante: ${manufacturer.trim() || 'Conforme instrumento'}
Modelo: ${model.trim() || 'Conforme instrumento'}
Grandeza: ${measurand.trim() || 'Metrologia Geral'}
---

Sua missão: REESCREVER e PADRONIZAR essa explicação em um Roteiro Operacional Padrão (POP) formal, rigoroso e de fácil leitura para o técnico na bancada, seguindo os requisitos da ISO/IEC 17025.

Diretrizes obrigatórias:
1. Mantenha fielmente todas as informações, pontos e métodos descritos pelo técnico, corrigindo a redação para vocabulário técnico formal de metrologia (ex: "calibrador padrão", "estabilização térmica", "relação TUR", "erro de indicação", "ciclos ascendente e descendente").
2. Estruture o procedimento de forma numerada e clara nos seguintes tópicos:
   1. Aclimatação e Estabilização Térmica
   2. Inspeção Física e Conexões de Segurança
   3. Padrão de Trabalho Recomendado e Rastreabilidade RBC
   4. Sequência Operacional de Ensaio (Passo a Passo)
   5. Critérios de Aceitação e Tolerâncias Aplicáveis
3. Retorne APENAS o texto pronto do procedimento, SEM blocos de código markdown (\`\`\`), SEM aspas envolvendo o texto e SEM mensagens de introdução ou conclusão.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(OPENCODE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-opencode-session': `calibhub-pop-${Date.now()}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.25
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      let msg = `Erro da API de IA (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error && errJson.error.message) msg = errJson.error.message;
      } catch (e) {}
      throw new Error(msg);
    }

    const data = await response.json();
    let content = (
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.reasoning_content) ||
      ''
    ).trim();

    // Limpa eventuais cercas markdown ```
    if (content.startsWith('```')) {
      content = content.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    if (!content) {
      throw new Error('A IA não retornou o texto do procedimento.');
    }

    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[CalibHub AI Warning] Falha na chamada da API para POP (${err.message}). Formatando relato com estrutura metrológica local...`);
    return formatLocalProcedureFallback(draftText, manufacturer, model, measurand);
  }
}

/**
 * Fallback local caso a API esteja offline:
 * Estrutura o relato do técnico nos tópicos da ISO/IEC 17025.
 */
function formatLocalProcedureFallback(draftText, manufacturer, model, measurand) {
  const title = manufacturer && model ? `${manufacturer} ${model}` : 'Instrumento de Bancada';
  return `1. Aclimatação e Estabilização Térmica:
Manter o instrumento e os padrões de teste na bancada em ambiente controlado (20 ± 2 °C ou 23 ± 5 °C, UR 30% a 70%) por no mínimo 2 horas antes de iniciar os ensaios.

2. Inspeção Física e Conexões de Segurança:
Verificar a integridade visual geral de ${title}, terminais de conexão e ausência de avarias.

3. Padrão de Trabalho e Rastreabilidade RBC:
Utilizar padrões de calibração rastreáveis RBC/INMETRO com relação de capacidade de medição TUR ≥ 4:1.

4. Sequência Operacional de Ensaio:
${draftText.trim()}

5. Critérios de Aceitação e Tolerâncias:
Calcular o erro de indicação em cada ponto (Erro = Indicação - Padrão). O instrumento é aprovado se o erro estiver dentro dos limites máximos admissíveis de fábrica.`;
}

module.exports = {
  generateMetrologyData,
  refineProcedureWithAi,
  DEFAULT_MODEL
};
