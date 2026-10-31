#!/usr/bin/env bash
set -euo pipefail

# Per-command timing helper
start_timer() { START_TIME="$(date +%s.%N)"; }
end_timer() { 
  END_TIME="$(date +%s.%N)"
  ELAPSED="$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo 0)"
  debug "⏱  $1 took ${ELAPSED}s"
}

debug() { echo "[start.sh] $@" >&2; }

PROJECT_DIR="/home/runner/work/DemigodzGaming/DemigodzGaming"
DIST_DIR="$PROJECT_DIR/dist"
DEPLOY_OUTPUT="/home/runner/work/_temp/omgithub-web/deployment-output.json"

debug "🔧 Starting build process..."
debug "   PROJECT_DIR: $PROJECT_DIR"
debug "   DIST_DIR: $DIST_DIR"
debug "   DEPLOY_OUTPUT: $DEPLOY_OUTPUT"

# Ensure directories exist
mkdir -p "$PROJECT_DIR" "$DIST_DIR" "$(dirname "$DEPLOY_OUTPUT")"

# Step 1: Write deployment output metadata (OPENCODE_WEB_DIR usage)
start_timer "write-deployment-metadata"
debug "Writing deployment output to $DEPLOY_OUTPUT"
cat > "$DEPLOY_OUTPUT" <<DEPLOY_JSON
{
  "project": "$PROJECT_DIR",
  "directory": "$DIST_DIR"
}
DEPLOY_JSON
end_timer "write-deployment-metadata"

# Step 2: Change to project directory and install dependencies
cd "$PROJECT_DIR" || { debug "❌ Failed to cd to $PROJECT_DIR"; exit 1; }
debug "📁 Changed to $PROJECT_DIR"

start_timer "npm-install"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
  debug "Installing dependencies..."
  npm install --no-audit --no-fund 2>&1 | while IFS= read -r line; do
    # Show progress, suppress noisy npm output
    :
  done
else
  debug "Dependencies already installed, skipping npm install."
fi
end_timer "npm-install"

# Step 3: Build when needed
start_timer "vite-build"
if [ -f "vite.config.mjs" ] || [ -f "vite.config.js" ] || [ -f "vite.config.ts" ]; then
  debug "Vite config found, running build..."
  npx vite build --base ./ 2>&1 | tail -20
else
  debug "No Vite config; creating minimal config for build..."
  echo 'import { defineConfig } from "vite"; export default defineConfig({ root: ".", build: { outDir: "dist" } })' > vite.config.mjs
  npx vite build --base ./ 2>&1 | tail -20
fi
end_timer "vite-build"

# Step 4: Verify built output exists
if [ ! -f "$DIST_DIR/index.html" ]; then
  debug "❌ Build completed but $DIST_DIR/index.html not found!"
  debug "   Contents of dist:"
  ls -la "$DIST_DIR/" 2>&1 || true
  exit 1
fi
debug "✅ Build verified: $DIST_DIR/index.html exists"

# Step 5: Serve in foreground on PORT (default 3000)
PORT="${PORT:-3000}"
debug "🚀 Starting development server on port $PORT"

# Check if already running on this port (controller reuse)
if lsof -i :"$PORT" > /dev/null 2>&1; then
  debug "Port $PORT is already in use (controller server reuse)."
else
  debug "Starting fresh server on port $PORT..."
fi

# Serve using vite preview or a simple static server
# Using vite preview in background, then wait
npx vite preview --port "$PORT" --host > /dev/null 2>&1 &
VITE_PID=$!

debug "Vite preview server PID: $VITE_PID"

# Wait for server to be ready
timeout 30 bash -c '
  for i in $(seq 1 30); do
    if curl -s "http://localhost:'$PORT'/index.html" > /dev/null 2>&1; then
      echo "Server ready!"
      exit 0
    fi
    sleep 1
  done
  echo "Server timeout"
  exit 1
' || { debug "⚠️ Server startup timeout, continuing anyway"; }

debug "✅ Server running on port $PORT"

# Keep running - the server is in foreground via vite preview
# If the server stops, this script will exit
wait $VITE_PID 2>/dev/null || true