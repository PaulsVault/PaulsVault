# Imagen reproducible para PaaS (Render/Railway/Fly). Compila backend + SPA y sirve todo.
# --- build ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web/package*.json ./web/
RUN npm --prefix web ci
COPY . .
RUN npm run build:all

# --- runtime ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
