# ==========================================
# Multi-stage Dockerfile para Coolify
# ==========================================

# Etapa 1: Compilar Frontend React (Vite)
FROM node:22-alpine AS frontend-builder
WORKDIR /app

# Forzar instalación de devDependencies (TypeScript, Vite, Tailwind) para el build
ENV NODE_ENV=development
COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build

# Etapa 2: Servidor Backend Node.js
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/data/uploads

# Instalar dependencias del servidor
COPY servidor/package*.json ./servidor/
WORKDIR /app/servidor
RUN npm install --omit=dev

# Copiar código fuente del servidor y panel admin
COPY servidor/src ./src
COPY servidor/public ./public

# Copiar cliente web compilado
COPY --from=frontend-builder /app/dist /app/dist

# Crear directorio de datos y uploads
RUN mkdir -p /app/data/uploads

EXPOSE 3000

# Verificación de salud para Coolify
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
