# KDT Aso - Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build dashboard
FROM node:20-alpine AS dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY core/ ./core/
COPY agents/ ./agents/
COPY config/ ./config/
COPY docs/ ./docs/

# Copy built dashboard
COPY --from=dashboard-builder /app/dashboard/dist ./dashboard/dist

# Create directories
RUN mkdir -p logs audio memory

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "core/index.js"]
