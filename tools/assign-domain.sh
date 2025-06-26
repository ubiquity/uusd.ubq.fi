#!/bin/bash
# Standalone script to assign custom domain to Deno Deploy project
# Usage: ./assign-domain.sh [project_name] [deno_deploy_token]

# Validate arguments
if [ $# -lt 2 ]; then
  echo "❌ Usage: $0 [project_name] [deno_deploy_token]" >&2
  echo "Example: $0 uusd-ubq-fi \$DENO_DEPLOY_TOKEN" >&2
  exit 1
fi

PROJECT_NAME=$1
DENO_DEPLOY_TOKEN=$2
CUSTOM_DOMAIN="${PROJECT_NAME}.deno.dev"

echo "🌐 Starting domain assignment for project: $PROJECT_NAME"
echo "Target domain: $CUSTOM_DOMAIN"

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

# Get project ID
PROJECT_ID=$(get_project_id "$PROJECT_NAME")

# Check if domain already exists
echo "🔍 Checking existing domains..."
existing_domains=$(curl -s -H "Authorization: Bearer $DENO_DEPLOY_TOKEN" \
  "https://dash.deno.com/api/projects/$PROJECT_ID/domains")

if [ $? -ne 0 ]; then
  echo "❌ Failed to fetch existing domains"
  exit 1
fi

# Check if our target domain is already assigned
if echo "$existing_domains" | jq -e ".[] | select(.domain == \"$CUSTOM_DOMAIN\")" > /dev/null 2>&1; then
  echo "✅ Custom domain $CUSTOM_DOMAIN is already assigned to $PROJECT_NAME"
  exit 0
fi

echo "📋 Current domains for $PROJECT_NAME:"
echo "$existing_domains" | jq -r '.[].domain' | sed 's/^/  - /'

# Assign the custom domain
echo "🌐 Assigning custom domain: $CUSTOM_DOMAIN"
response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
  -X POST "https://dash.deno.com/api/projects/$PROJECT_ID/domains" \
  -H "Authorization: Bearer $DENO_DEPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"$CUSTOM_DOMAIN\"}")

# Extract HTTP status and body
http_code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
body=$(echo "$response" | sed -e 's/HTTPSTATUS:.*//g')

if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
  echo "✅ Successfully assigned custom domain $CUSTOM_DOMAIN to $PROJECT_NAME"
  echo "🎉 Your project should now be available at: https://$CUSTOM_DOMAIN"
else
  echo "❌ Failed to assign custom domain (HTTP $http_code)"
  echo "Response body: $body"
  exit 1
fi
