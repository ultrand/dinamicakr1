# Imagem única: API Express + frontend estático (mesma URL pública).
FROM node:22-bookworm-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

COPY server ./server
COPY client ./client
COPY design-system ./design-system

ENV NODE_ENV=production
RUN npm run db:generate --workspace=server
RUN npm run build --workspace=client
RUN npm run build --workspace=server

EXPOSE 3001
ENV PORT=3001

# Migrações + seed (idempotente) + servidor
CMD ["npm", "run", "start:seed", "--workspace=server"]
