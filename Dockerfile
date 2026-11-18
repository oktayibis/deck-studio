# Stage 1: Frontend build (optional / when frontend directory is present)
FROM node:22-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN if [ -f frontend/package.json ]; then \
      cd frontend && npm ci && npm run build; \
    fi

# Stage 2: Production Node.js + Playwright runtime
FROM mcr.microsoft.com/playwright:v1.50.0-noble AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3456
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY --from=frontend-builder /app ./

RUN mkdir -p /app/data

EXPOSE 3456

CMD ["npm", "start"]
