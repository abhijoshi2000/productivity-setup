FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev pixman-dev python3
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Re-install production-only deps (with native addons already compilable)
RUN rm -rf node_modules && npm ci --omit=dev

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache cairo jpeg pango giflib pixman

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
