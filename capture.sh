#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# DemigodzGaming MOBA Arena Prototyp - Capture Script
# =============================================================================
# Captures desktop and mobile views of the running app.
# Accepts CAPTURE_URL and CAPTURE_DIR environment variables.
# Captures desktop and mobile views as final-desktop.png and final-mobile.png.
# Exits 75 for temporary navigation/browser infrastructure failures.
# Exits 1 for script or rendering defects.
# Keeps the app running after capture.
# =============================================================================

# Validate required environment variables
if [ -z "${CAPTURE_URL:-}" ]; then
    echo "ERROR: CAPTURE_URL environment variable is not set" >&2
    exit 1
fi

if [ -z "${CAPTURE_DIR:-}" ]; then
    echo "ERROR: CAPTURE_DIR environment variable is not set" >&2
    exit 1
fi

# Record overall start time
OVERALL_START=$(date +%s%N)

# Create CAPTURE_DIR if it doesn't exist
CAPTURE_DIR_ABS="$(mkdir -p "$CAPTURE_DIR" && cd "$CAPTURE_DIR" && pwd)"

# Validate the URL is reachable first (basic check)
echo "Validating capture URL: $CAPTURE_URL"
if ! curl --output /dev/null --silent --head --max-time 5 "$CAPTURE_URL" 2>/dev/null; then
    echo "WARNING: CAPTURE_URL may not be immediately reachable, but proceeding with capture"
fi

# Per-command timing utility
timer_start() {
    echo "$(date +%s%N)"
}

timer_end() {
    local start=$1
    local label=$2
    local end=$(date +%s%N)
    local elapsed_ms=$(( (end - start) / 1000000 ))
    echo "  $label: ${elapsed_ms}ms"
}

# timing for the whole capture process
TIMER_OVERALL_START=$(timer_start)

# Use the runtime Playwright infrastructure
# The Playwright runtime is at $HOME/.local/share/omgithub-playwright
PLAYWRIGHT_HOME="$HOME/.local/share/omgithub-playwright"

# Check if playwright is available - ensure package.json exists
if [ ! -f "$PLAYWRIGHT_HOME/package.json" ]; then
    echo "ERROR: Playwright runtime package.json not found at $PLAYWRIGHT_HOME" >&2
    exit 1
fi

# Build the capture Node.js script path
CAPTURE_NODE_JS="/tmp/capture_moba_$$ .js"
cat > "$CAPTURE_NODE_JS" <<'NODEEOF'
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Require playwright from the Playwright runtime home
const pwPkgPath = process.env.PW_PKG_PATH || join(process.env.HOME, '.local/share/omgithub-playwright/package.json');
const require = createRequire(pwPkgPath);
const { chromium } = require('playwright');

const runtimeDir = process.env.HOME + '/.local/share/omgithub-playwright';
const config = JSON.parse(readFileSync(join(runtimeDir, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'));
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtimeDir, 'display'), 'utf8').trim();

const url = process.env.CAPTURE_URL;
const output = process.env.CAPTURE_DIR_ABS;
mkdirSync(output, { recursive: true });

const transient = error => { throw Object.assign(error, { exitCode: 75 }) };

let browser;
try {
  browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(transient);
  const views = [['desktop', 1440, 900], ['mobile', 390, 844]];
  
  for (const [name, width, height] of views) {
    const page = await browser.newPage({ viewport: { width, height } }).catch(transient);
    page.setDefaultTimeout(30000);
    const failures = [];
    page.on('pageerror', error => { console.error(error.message); failures.push(error.message) });
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(url).origin) failures.push(`HTTP ${response.status()}: ${response.url()}`) });
    const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient);
    if (!response?.ok()) throw Object.assign(new Error(`HTTP ${response?.status()} loading preview`), { exitCode: !response || [408, 429, 500, 502, 503, 504].includes(response.status()) ? 75 : 1 });
    await page.locator('body').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 }).catch(error => {
      if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error);
      throw error;
    });
    if (process.env.CAPTURE_STRICT === '1' && failures.length) throw new Error(`Published build failed: ${failures.join('; ')}`);
    await page.close();
  }
} catch (error) { console.error(error); process.exitCode = error.exitCode || 1; }
finally { await browser?.close().catch(error => { console.error(error); process.exitCode ||= 75 }); }
NODEEOF

# Execute the Node.js capture script with proper env vars
CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR_ABS="$CAPTURE_DIR_ABS" PLAYWRIGHT_HOME="$PLAYWRIGHT_HOME" node "$CAPTURE_NODE_JS" 2>&1
CAPTURE_EXIT=$?

# Clean up temp file
rm -f "$CAPTURE_NODE_JS"

OVERALL_END=$(date +%s%N)
OVERALL_ELAPSED_MS=$(( (OVERALL_END - OVERALL_START) / 1000000 ))
echo "capture.sh completed in ${OVERALL_ELAPSED_MS}ms" >> "$OPENCODE_WEB_DIR/app.log" 2>&1
echo "Capture images saved to: $CAPTURE_DIR_ABS"
echo "  - final-desktop.png"
echo "  - final-mobile.png"

# Verify capture files exist
if [ ! -f "$CAPTURE_DIR_ABS/final-desktop.png" ]; then
    echo "WARNING: final-desktop.png not found in $CAPTURE_DIR_ABS"
fi
if [ ! -f "$CAPTURE_DIR_ABS/final-mobile.png" ]; then
    echo "WARNING: final-mobile.png not found in $CAPTURE_DIR_ABS"
fi

if [ $CAPTURE_EXIT -ne 0 ]; then
    echo "Capture failed with exit code $CAPTURE_EXIT"
    exit 1
fi

echo "Capture complete. App left running."
exit 0