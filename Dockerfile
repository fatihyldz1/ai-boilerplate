FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/inference/package.json ./packages/inference/package.json
COPY packages/trpc/package.json ./packages/trpc/package.json

RUN npm ci --omit=dev --include-workspace-root=false \
  -w @app/api \
  -w @app/config \
  -w @app/inference \
  -w @app/trpc

COPY apps/api ./apps/api
COPY packages/config ./packages/config
COPY packages/inference ./packages/inference
COPY packages/trpc ./packages/trpc

CMD ["npm", "-w", "@app/api", "run", "start"]
