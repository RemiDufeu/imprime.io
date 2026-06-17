# BUILD
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/common/package*.json ./packages/common/
COPY packages/sdk/package*.json ./packages/sdk/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/backend/package*.json ./packages/backend/

RUN npm install

COPY packages/common ./packages/common
COPY packages/sdk ./packages/sdk
COPY packages/frontend ./packages/frontend
COPY packages/backend ./packages/backend

RUN npm run build:common
RUN npm run build:sdk
RUN npm run build:frontend
RUN npm run build:backend

# RUN
FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/common/package*.json ./packages/common/

RUN npm install --workspace=@imprime/backend --workspace=@imprime/common --omit=dev

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist
COPY --from=builder /app/packages/common/src/assets/fonts ./packages/common/src/assets/fonts

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=@imprime/backend"]
