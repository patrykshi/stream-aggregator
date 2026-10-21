# Imagem base Node.js Alpine leve
FROM node:22-alpine@sha256:ce8d97f7cfc7c5386421eb932df20a29df99b1a7f469f6157d5c9956702ffadc AS base

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci --omit=dev

# Copia código-fonte e estáticos
COPY src ./src
COPY public ./public

# Define usuário sem privilégios de root para segurança
USER node

# Porta padrão do serviço
EXPOSE 7001

ENV NODE_ENV=production
ENV PORT=7001

# Healthcheck interno
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:7001/health || exit 1

CMD ["node", "src/server.js"]
