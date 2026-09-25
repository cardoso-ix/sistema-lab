# 🔬 CalibHub Pro - Sistema Metrológico de Bancada & Roteiros POP (ISO/IEC 17025)

Sistema completo de consulta e gerenciamento de instrumentos, roteiros operacionais de calibração (POP), certificados e manuais técnicos, desenvolvido para uso em bancadas de laboratório metrológico e dispositivos móveis (smartphones/tablets).

---

## 🚀 Principais Recursos

1. **📱 Otimizado para Celular (Mobile-First):**
   - **📸 Tirar Foto na Hora:** Disparo direto da câmera traseira do smartphone (`capture="environment"`). Aponte, tire a foto do instrumento e anexe ao cadastro sem burocracia.
   - **👁️ Visor ao Vivo (In-App Viewfinder):** Câmera com guias de enquadramento ciano na tela e botão disparador profissional.
   - **⚡ Compressão Inteligente no Navegador:** Reduz fotos pesadas (15MB a 30MB) para Full HD otimizado (~400KB a 600KB) no próprio celular antes do upload.
   - **Interface Touch:** Botões com altura mínima de 48px e prevenção de zoom involuntário no iOS Safari.

2. **🎙️ Ditado por Voz & IA no POP (ISO/IEC 17025):**
   - **Falar por Áudio (Web Speech API):** O técnico dita como fez a calibração e o texto é transcrito em tempo real com cronômetro de gravação.
   - **✨ Melhorar com IA (DeepSeek v4.1 via OpenCode Go):** Transforma o relato informal ou áudio em um POP formal e numerado segundo a norma ABNT NBR ISO/IEC 17025 (Aclimatação, Inspeção, Padrões Recomendados RBC/TUR $\ge 4:1$, Ciclos Ascendente/Descendente e Critérios de Tolerância).
   - **↩️ Desfazer:** Restaura o rascunho anterior imediatamente.
   - **Digitação Manual:** TAG, Nome, Fabricante, Modelo, Grandeza, Faixa e Pontos são preenchidos manualmente com travas estritas contra campos vazios.

3. **🔒 Segurança Metrológica & Controle de Acesso (RBAC):**
   - **Perfis:** Administrador (acesso total, cadastro, edição e gestão de usuários) e Técnico (apenas consulta e visualização de bancada).
   - **Criptografia:** Senhas com hash `scrypt` + salt criptográfico individual.
   - **Sessão:** Tokens assinados com HMAC-SHA256 e proteção contra Directory Traversal.
   - **Travas Estritas:** Bloqueio de salvamento caso qualquer campo obrigatório esteja em branco.

4. **📑 Documentação Integrada em PDF:**
   - Visualizador de PDF integrado para o último Certificado de Calibração, POP formal e Manual do Fabricante.
   - Lightbox para ampliação da foto do instrumento em alta definição.

---

## 🛠️ Instalação & Execução

### Pré-requisitos
- Node.js v18+ (recomendado v20 ou v22)

### 1. Instalar Dependências
```bash
npm install
```

### 2. Iniciar o Servidor
```bash
npm start
```
O servidor será iniciado na porta **3000**:
- **Acesso local:** [http://localhost:3000](http://localhost:3000)
- **Acesso pelo celular (mesma rede Wi-Fi):** Acesse pelo IP exibido no terminal (ex: `http://192.168.x.x:3000`).

---

## 🔑 Contas de Acesso (Semana de Testes)

### 🛡️ Administradores (Acesso Total: Cadastro, Edição, Exclusão, Gestão)
| Nome | Usuário | Senha | Perfil |
|---|---|---|---|
| **Eduardo** | `eduardo` | `eduardo123` | Administrador |
| **Alan** | `alan` | `alan123` | Administrador |
| **Jean** | `jean` | `jean123` | Administrador |
| **Admin Padrão** | `admin` | `admin123` | Administrador |

### 🛠️ Técnicos (Consulta de Bancada, Visualização de POP, Certificados e Fotos)
| Nome | Usuário | Senha | Perfil |
|---|---|---|---|
| **Leonardo** | `leonardo` | `leonardo123` | Técnico |
| **Igor** | `igor` | `igor123` | Técnico |
| **Daniel** | `daniel` | `daniel123` | Técnico |
| **Grazieli** | `grazieli` | `grazieli123` | Técnico |
| **Técnico Padrão** | `tecnico` | `tecnico123` | Técnico |

---

## 🧪 Testes Automatizados (TDD)

Execute a suíte completa de testes automatizados (34 testes):
```bash
npm test
```

---

## 📂 Estrutura do Projeto

```
replica/
├── public/                # Frontend SPA (Vanilla JS + CSS Dark Obsidian)
│   ├── app.js             # Lógica cliente, áudio, câmera e eventos
│   ├── index.html         # Estrutura semântica e modais
│   └── style.css          # Design System Dark Obsidian e responsividade mobile
├── src/                   # Backend Node.js
│   ├── ai.js              # Integração DeepSeek v4.1 e fallback metrológico
│   ├── db.js              # Banco SQLite integrado (node:sqlite) e schema
│   ├── models.js          # Regras de negócio de instrumentos e usuários
│   ├── security.js        # Criptografia scrypt, tokens HMAC e travas
│   └── server.js          # API REST Express e upload Multer
├── tests/                 # Suíte de testes automatizados
│   ├── api.test.js        # Testes de integração HTTP e rotas de IA
│   ├── instruments.test.js# Testes de negócio e banco de dados
│   └── security.test.js   # Testes de criptografia e travas de validação
├── uploads/               # Fotos e documentos PDF dos instrumentos
├── package.json
└── README.md
```
