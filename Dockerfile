# KDT Aso - Production Dockerfile
# Hardened: non-root user, minimal image, health check

FROM node:18-alpine AS base

# Security: add non-root user
RUN addgroup -g 1001 -S kdt && \
    adduser -S kdt -u 1001 -G kdt

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Build dashboard
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci && npm cache clean --force

COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# Copy application
COPY core/ ./core/
COPY agents/ ./agents/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY nginx/ ./nginx/

# Create required directories with correct ownership
RUN mkdir -p logs memory documents backups audio config/keys && \
    chown -R kdt:kdt /app

# Remove dev files
RUN rm -rf dashboard/node_modules dashboard/src dashboard/*.json dashboard/*.ts

# Security: run as non-root
USER kdt

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

EXPOSE 3001

# Security: read-only root filesystem compatible
ENV NODE_ENV=production

CMD ["node", "core/index.js"]
