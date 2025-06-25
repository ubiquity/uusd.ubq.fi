#!/bin/bash
# CI Simulation - Deno Setup

echo "🔧 Setting up Deno environment..."

# Check if Deno is already installed
if ! command -v deno &> /dev/null; then
  echo "Installing Deno..."
  curl -fsSL https://deno.land/x/install/install.sh | sh -s v1.43.0
  export PATH="$HOME/.deno/bin:$PATH"
else
  echo "Deno is already installed"
fi

# Verify Deno version
DENO_VERSION=$(deno --version | head -n 1 | cut -d' ' -f2)
if [[ "$DENO_VERSION" != "1.43.0" ]]; then
  echo "Updating Deno to v1.43.0..."
  deno upgrade --version 1.43.0
fi

# Install deployctl
echo "Installing deployctl..."
deno install -A --no-check -r -f https://deno.land/x/deploy/deployctl.ts

# Verify installations
if ! command -v deployctl &> /dev/null; then
  echo "❌ Error: deployctl installation failed" >&2
  exit 1
fi

echo "✅ Deno setup completed successfully"
exit 0
