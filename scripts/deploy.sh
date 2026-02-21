#!/bin/bash
# KDT Aso - Deployment Script

set -e

# Configuration
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kdt-aso}"
DEPLOY_ENV="${DEPLOY_ENV:-production}"

echo "🚀 Deploying KDT Aso ($DEPLOY_ENV)..."

# Validate environment
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "   Copy .env.example to .env and configure it"
    exit 1
fi

# Source environment variables
set -a
source .env
set +a

# Check required variables
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ Error: ANTHROPIC_API_KEY is required"
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "kdt-aso-production-secret-change-me" ]; then
    echo "⚠️  Warning: JWT_SECRET should be changed for production"
fi

# Pull latest images
echo "📥 Pulling latest images..."
docker-compose pull

# Build application
echo "🏗️  Building application..."
docker-compose build

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Start new containers
echo "▶️  Starting containers..."
if [ "$DEPLOY_ENV" = "production" ]; then
    docker-compose --profile production up -d
else
    docker-compose up -d
fi

# Wait for health check
echo "⏳ Waiting for health check..."
sleep 10

# Check health
HEALTH_STATUS=$(docker-compose exec -T kdt-aso wget -qO- http://localhost:3001/api/health 2>/dev/null || echo '{"status":"error"}')
if echo "$HEALTH_STATUS" | grep -q '"status":"ok"'; then
    echo "✅ Deployment successful!"
    echo "   Dashboard: http://localhost:3001"
else
    echo "⚠️  Health check failed, checking logs..."
    docker-compose logs --tail=50 kdt-aso
fi

echo ""
echo "📊 Container status:"
docker-compose ps
