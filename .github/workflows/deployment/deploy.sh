#!/bin/bash
# Deployment Script
# Usage: ./deploy.sh [environment] [deno_deploy_token] [production_project] [preview_project]

# Validate arguments
if [ $# -lt 4 ]; then
  echo "❌ Usage: $0 [production|preview] [deno_deploy_token] [production_project] [preview_project]" >&2
  exit 1
fi

ENVIRONMENT=$1
DENO_DEPLOY_TOKEN=$2
DENO_PROJECT_NAME=$3
DENO_PREVIEW_PROJECT_NAME=$4

echo "🚀 Starting $ENVIRONMENT deployment..."

# Verify deployctl is available
if ! command -v deployctl &> /dev/null; then
  echo "❌ Error: deployctl not found. Run setup-deno.sh first." >&2
  exit 1
fi

# Set target project
if [ "$ENVIRONMENT" = "production" ]; then
  PROJECT_NAME="$DENO_PROJECT_NAME"
  echo "🏭 Deploying to production project: $PROJECT_NAME"
else
  PROJECT_NAME="$DENO_PREVIEW_PROJECT_NAME"
  echo "🛠️ Deploying to preview project: $PROJECT_NAME"
  CREATE_FLAG="--create"
fi

# Function to get project ID by name
get_project_id() {
  local project_name=$1
  echo "🔍 Fetching project ID for: $project_name"
  response=$(curl -s -H "Authorization: Bearer $DENO_DEPLOY_TOKEN" \
    "https://dash.deno.com/api/projects/$project_name")
  
  if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch project details"
    exit 1
  fi
  
  project_id=$(echo "$response" | jq -r '.id')
  if [ -z "$project_id" ] || [ "$project_id" == "null" ]; then
    echo "❌ Project $project_name not found. API response:"
    echo "$response"
    exit 1
  fi
  
  echo "ℹ️ Found project ID: $project_id"
  echo "$project_id"
}

# Function to create project if it doesn't exist
create_project() {
  local project_name=$1
  project_id=$(get_project_id "$project_name")
  
  # If project exists, return its ID
  if [ -n "$project_id" ]; then
    echo "ℹ️ Project $project_name already exists"
    return
  fi
  
  echo "🆕 Creating project: $project_name"
  create_response=$(curl -s -X POST "https://dash.deno.com/api/projects" \
    -H "Authorization: Bearer $DENO_DEPLOY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$project_name\"}")
  
  if [ $? -ne 0 ]; then
    echo "❌ Failed to create project $project_name"
    exit 1
  fi
  
  project_id=$(echo "$create_response" | jq -r '.id')
  if [ -z "$project_id" ] || [ "$project_id" == "null" ]; then
    echo "❌ Failed to get project ID after creation"
    exit 1
  fi
}

# Function to set secret
set_secret() {
  local project_id=$1
  local secret_name=$2
  local secret_value=$3
  
  echo "🔒 Setting secret: $secret_name"
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "https://dash.deno.com/api/projects/$project_id/secrets" \
    -H "Authorization: Bearer $DENO_DEPLOY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$secret_name\", \"value\":\"$secret_value\"}")
  
  if [ "$http_status" -eq 200 ]; then
    echo "✅ Secret set successfully"
    return 0
  else
    echo "❌ Failed to set secret $secret_name (HTTP $http_status)"
    exit 1
  fi
}

# Get or create project and set ID
project_id=$(get_project_id "$PROJECT_NAME")
if [ -z "$project_id" ]; then
  create_project "$PROJECT_NAME"
  project_id=$(get_project_id "$PROJECT_NAME")
fi

# Set secrets based on environment
if [ "$ENVIRONMENT" = "production" ]; then
  set_secret "$project_id" "BOT_TOKEN" "$BOT_TOKEN"
  set_secret "$project_id" "WEBHOOK_SECRET" "$WEBHOOK_SECRET_PRODUCTION"
  set_secret "$project_id" "OPENROUTER_API_KEY" "$OPENROUTER_API_KEY"
  set_secret "$project_id" "BOT_TYPE" "production"
else
  set_secret "$project_id" "BOT_TOKEN" "$PREVIEW_BOT_TOKEN"
  set_secret "$project_id" "WEBHOOK_SECRET" "$WEBHOOK_SECRET_PREVIEW"
  set_secret "$project_id" "OPENROUTER_API_KEY" "$OPENROUTER_API_KEY"
  set_secret "$project_id" "BOT_TYPE" "preview"
fi

# Run deployment with environment variables
cd ..
deployctl deploy \
  --project="$PROJECT_NAME" \
  $CREATE_FLAG \
  --entrypoint=src/main.ts \
  --token="$DENO_DEPLOY_TOKEN" \
  --root="." \
  --include="**" \
  --exclude="**.spec.ts" \
  --env="$ENV_VARS"
cd -

DEPLOY_STATUS=$?

if [ $DEPLOY_STATUS -ne 0 ]; then
  echo "❌ Deployment failed with status $DEPLOY_STATUS" >&2
  exit $DEPLOY_STATUS
fi

echo "✅ $ENVIRONMENT deployment completed successfully"
exit 0
