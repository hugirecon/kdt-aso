#!/bin/bash
# KDT Aso - Production Build Script

set -e

echo "🏗️  Building KDT Aso for production..."

# Check required environment variables
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY not set"
fi

# Build Docker image
echo "📦 Building Docker image..."
docker build -t kdt-aso:latest .

echo "✅ Build complete!"
echo ""
echo "To run:"
echo "  docker-compose up -d"
echo ""
echo "To run with nginx/SSL:"
echo "  docker-compose --profile production up -d"
