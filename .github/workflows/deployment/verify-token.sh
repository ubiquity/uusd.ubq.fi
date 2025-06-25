#!/bin/bash
# Token Verification Script
# Usage: ./verify-token.sh [environment] [deno_deploy_token] [production_project] [preview_project]

# Validate arguments
if [ $# -lt 4 ]; then
  echo "❌ Usage: $0 [production|preview] [deno_deploy_token] [production_project] [preview_project]" >&2
  exit 1
fi

ENVIRONMENT=$1
DENO_DEPLOY_TOKEN=$2
DENO_PROJECT_NAME=$3
DENO_PREVIEW_PROJECT_NAME=$4

echo "🔑 Verifying $ENVIRONMENT environment access..."

# Set target project
PROJECT_NAME="$([ "$ENVIRONMENT" = "production" ] && echo "$DENO_PROJECT_NAME" || echo "$DENO_PREVIEW_PROJECT_NAME")"

# Test API access
API_URL="https://dash.deno.com/api/projects/$PROJECT_NAME"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $DENO_DEPLOY_TOKEN" \
  "$API_URL")

# Handle response
if [ "$RESPONSE" -eq 200 ]; then
  echo "✅ Token verification successful (HTTP 200)"
  exit 0
elif [ "$RESPONSE" -eq 401 ]; then
  echo "❌ Error: Token verification failed - unauthorized (HTTP 401)" >&2
  exit 1
elif [ "$RESPONSE" -eq 404 ]; then
  echo "❌ Error: Project not found (HTTP 404)" >&2
  exit 1
else
  echo "❌ Error: Unexpected response (HTTP $RESPONSE)" >&2
  exit 1
fi
