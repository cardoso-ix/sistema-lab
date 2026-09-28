# ========================================================
# CalibHub Pro - Dockerfile para Produção Contínua 24/7
# Node.js 22 LTS (Alpine Linux) com suporte a node:sqlite
# ========================================================

FROM node:22-alpine

WORKDIR /app

# Instala ferramentas básicas necessárias
RUN apk add --no-cache wget

# Copia manifestos de dependências
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --omit=dev

# Copia código-fonte e arquivos da aplicação
COPY public ./public
COPY src ./src
COPY data ./data
COPY uploads ./uploads

# Cria diretórios persistentes para o banco e uploads
RUN mkdir -p /app/data /app/uploads/photos /app/uploads/docs

# Configuração de Variáveis de Ambiente Padrão
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV UPLOADS_DIR=/app/uploads

# Exposição da porta da aplicação
EXPOSE 3000

# Verificação de saúde contínua do container (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Comando de inicialização
CMD ["node", "src/server.js"]
