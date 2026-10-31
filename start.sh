#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# DemigodzGaming MOBA Arena Prototyp - Start Script
# =============================================================================
# Serves the MOBA Arena in the foreground on PORT (default 3000).
# Writes deployment-output.json for the OMGihtub runtime infrastructure.
# Reuses healthy server; only restarts app-server if repair requires it.
# =============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Ensure OPENCODE_WEB_DIR and PORT are available
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must be set}"
PORT="${APP_PORT:-3000}"

# Record start time for per-command timing
START_TIME=$(date +%s%N)

# Write deployment-output.json for the OMGihtub runtime infrastructure.
# This file must contain { project: "<absolute project path>", directory: "<absolute built output directory>" }
DEPLOY_OUTPUT="/home/runner/work/_temp/omgithub-web/deployment-output.json"
mkdir -p "$(dirname "$DEPLOY_OUTPUT")"

# Use the absolute project path; built output directory is 'dist' within PROJECT_DIR
# (source and built output stay inside PROJECT_DIR)
PROJECT_ABS="$(cd "$PROJECT_DIR" && pwd)"
BUILT_DIR="$PROJECT_ABS/dist"
mkdir -p "$BUILT_DIR"

# Simple build step: copy index.html and index.js to dist
cp -f "$PROJECT_ABS/index.html" "$BUILT_DIR/index.html"
cp -f "$PROJECT_ABS/index.js" "$BUILT_DIR/index.js" 2>/dev/null || true
cp -f "$PROJECT_ABS/package.json" "$BUILT_DIR/package.json" 2>/dev/null || true

# Write deployment output JSON
cat > "$DEPLOY_OUTPUT" <<DEPLOYEOF
{
  "project": "$PROJECT_ABS",
  "directory": "$BUILT_DIR"
}
DEPLOYEOF

# Install npm dependencies if needed (Phaser requires them)
NPM_DIR="$PROJECT_ABS"
if [ ! -d "$NPM_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    cd "$NPM_DIR"
    npm install --no-audit --no-fund 2>&1 | tail -3
fi

# Log timing
END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
echo "start.sh build phase completed in ${ELAPSED_MS}ms" >> "$OPENCODE_WEB_DIR/app.log" 2>&1

# Serve in the foreground on PORT defaulting to 3000 using Python HTTP server
# This avoids Node.js ESM import issues
echo "Starting static server on port $PORT, serving $BUILT_DIR..."
echo "Serving MOBA Arena Prototyp - visit http://localhost:$PORT" >> "$OPENCODE_WEB_DIR/app.log" 2>&1

# Export PORT for any child processes
export PORT

# Use Python's built-in HTTP server to serve the dist directory
# This is simpler and avoids Node.js ESM import complications
cd "$BUILT_DIR"

# Start the Python HTTP server in the background
python3 -m http.server "$PORT" --directory "$BUILT_DIR" >> "$OPENCODE_WEB_DIR/app.log" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
SERVER_READY=false
for i in $(seq 1 30); do
    if curl --output /dev/null --silent --head --max-time 1 "http://localhost:$PORT/" 2>/dev/null; then
        SERVER_READY=true
        echo "Server ready on port $PORT" >> "$OPENCODE_WEB_DIR/app.log" 2>&1
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Server failed to start on port $PORT" >&2
        # Kill the python server
        kill "$SERVER_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 0.5
done

# Log timing for server startup
END_TIME2=$(date +%s%N)
ELAPSED_MS2=$(( (END_TIME2 - START_TIME) / 1000000 ))
echo "start.sh server phase completed in ${ELAPSED_MS2}ms" >> "$OPENCODE_WEB_DIR/app.log" 2>&1

# The server is running in the background - keep this script going
# The tmux session manages keeping this process alive
# Wait for the server process (but don't block indefinitely)
echo "MOBA Arena Prototyp is running on http://localhost:$PORT" >> "$OPENCODE_WEB_DIR/app.log" 2>&1

# Wait a bit then exit - the tmux session will keep the server alive
# Actually, we'll wait for the server process but allow script to complete
# The key is that the server is running in the background
wait $SERVER_PID 2>/dev/null || true

echo "start.sh completed" >> "$OPENCODE_WEB_DIR/app.log" 2>&1