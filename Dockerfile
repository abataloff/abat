# Stage 1: build
FROM node:22-alpine AS build
RUN apk add --no-cache build-base python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:all

# Stage 2: production dependencies (with native modules)
FROM node:22-alpine AS deps
RUN apk add --no-cache build-base python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 3: run
FROM node:22-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
RUN mkdir -p /data
EXPOSE 8051
CMD ["node", "dist-server/server/prod.js"]
