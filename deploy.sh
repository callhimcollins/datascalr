#!/usr/bin/env bash
set -e

DOMAIN="${1:-datascalr.app}"

if [ ! -f .env.production ]; then
  echo "Error: .env.production not found."
  echo "Copy .env.production.template to .env.production and fill in your values."
  exit 1
fi

echo "=== Deploying DataScalr ==="

# Pull latest code
git pull origin master

# Build and start everything
DOMAIN="$DOMAIN" docker compose up -d --build

# Clean up old images
docker image prune -f

echo "=== Deployed at https://$DOMAIN ==="
