# 🌐 Guia de Implantação 24h/dia (Hospedagem em Nuvem Persistente)

Este guia ensina o passo a passo para colocar o **CalibHub Pro** online 24 horas por dia, 7 dias por semana, com link HTTPS seguro e persistência completa de banco de dados (`calibhub.db`) e arquivos anexados (`uploads/photos` e `uploads/docs`).

---

## 🚀 Opção 1: Render.com (Recomendado - Mais Fácil e Estável)

O Render permite rodar containers Docker com discos persistentes e HTTPS gratuito automático.

### Passo a Passo:
1. Crie uma conta gratuita em [render.com](https://render.com).
2. Suba o projeto para um repositório no seu **GitHub** (ou GitLab).
3. No painel do Render, clique em **New +** $\rightarrow$ **Web Service**.
4. Conecte seu repositório GitHub do CalibHub.
5. Configure as opções básicas:
   - **Name:** `calibhub-pro` (ou o nome que desejar)
   - **Region:** Ohio ou Oregon (EUA) ou Frankfurt
   - **Environment:** `Docker` (ele usará o [`Dockerfile`](file:///c:/Users/Proje/Desktop/replica/Dockerfile) já criado)
   - **Instance Type:** Starter (ou superior para suportar disco persistente)
6. **Configurar Disco Persistente (Essencial para não perder dados):**
   - Na seção **Disks**, clique em **Add Disk**.
   - **Name:** `calibhub-storage`
   - **Mount Path:** `/app/storage`
   - **Size:** `1 GB` (ou conforme sua necessidade de fotos e PDFs)
7. **Configurar Variáveis de Ambiente (Environment Variables):**
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `DATA_DIR` = `/app/storage/data`
   - `UPLOADS_DIR` = `/app/storage/uploads`
   - *(Opcional)* `OPENCODE_API_KEY` = sua chave de API para o recurso "Melhorar com IA".
8. Clique em **Create Web Service**.
9. O Render construirá o container e gerará seu link público permanente (ex: `https://calibhub-pro.onrender.com`).

> **Dica:** O projeto já inclui o arquivo [`render.yaml`](file:///c:/Users/Proje/Desktop/replica/render.yaml). Se você usar a opção **Blueprint** no Render, tudo acima é configurado automaticamente!

---

## 🚂 Opção 2: Railway.app

O Railway é extremamente rápido de configurar e suporta volumes persistentes com cobrança proporcional por uso.

### Passo a Passo:
1. Crie uma conta em [railway.app](https://railway.app).
2. Clique em **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Selecione o repositório do CalibHub.
4. Clique no serviço criado $\rightarrow$ aba **Settings** $\rightarrow$ **Networking** $\rightarrow$ **Generate Domain** (para criar a URL pública HTTPS).
5. Na aba **Volumes**, clique em **Add Volume**:
   - Volume 1: Mount Path = `/app/data`
   - Volume 2: Mount Path = `/app/uploads`
6. O Railway reiniciará a aplicação e ela estará disponível 24h com todos os dados salvos em disco persistente.

---

## 🐧 Opção 3: VPS Própria (DigitalOcean, Hetzner, AWS, Oracle Cloud Free)

Se você tiver uma máquina virtual Linux (Ubuntu 22.04 / 24.04 LTS):

### Passo a Passo:
1. Instale o Docker e o Docker Compose na VPS:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose
   ```
2. Clone o repositório na VPS:
   ```bash
   git clone <URL_DO_SEU_REPOSITORIO> calibhub
   cd calibhub
   ```
3. Inicie o serviço em segundo plano (24/7 com reinicialização automática):
   ```bash
   docker compose up -d
   ```
4. O container ficará rodando 24 horas por dia. Se o servidor for reiniciado, o Docker sobe a aplicação automaticamente (`restart: unless-stopped`).
5. *(Opcional)* Aponte seu domínio e use o Caddy ou Nginx com SSL grátis (Let's Encrypt):
   ```caddy
   calibhub.seulaboratorio.com.br {
       reverse_proxy localhost:3000
   }
   ```

---

## 🔒 Checklist de Segurança em Produção

Antes de divulgar o link para todos os usuários externos:
1. Acesse o sistema como `admin` (senha padrão: `admin123`).
2. Acesse a aba de **Usuários** e altere as senhas padrões de teste.
3. Cadastre os técnicos e administradores com seus respectivos e-mails/nomes.
4. Monitore a saúde do serviço pela rota: `https://seu-link/api/health`.
