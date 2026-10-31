#!/usr/bin/env bash
set -euo pipefail

# Per-command timing helper
start_timer() { START_TIME="$(date +%s.%N)"; }
end_timer() { 
  END_TIME="$(date +%s.%N)"
  ELAPSED="$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo 0)"
  debug "⏱  $1 took ${ELAPSED}s"
}

debug() { echo "[capture.sh] $@" >&2; }

# Validate required environment variables
if [ -z "${CAPTURE_URL:-}" ]; then
  debug "❌ CAPTURE_URL environment variable is not set"
  exit 1
fi

if [ -z "${CAPTURE_DIR:-}" ]; then
  debug "❌ CAPTURE_DIR environment variable is not set"
  exit 1
fi

debug "📸 Starting capture process..."
debug "   CAPTURE_URL: $CAPTURE_URL"
debug "   CAPTURE_DIR: $CAPTURE_DIR"

# Ensure output directory exists and is writable
mkdir -p "$CAPTURE_DIR"
CAPTURE_DIR="$(cd "$CAPTURE_DIR" && pwd)"
debug "Resolved CAPTURE_DIR to: $CAPTURE_DIR"

# Validate we can write to the capture directory
touch "$CAPTURE_DIR/.write_test" 2>/dev/null && rm "$CAPTURE_DIR/.write_test" || {
  debug "❌ Cannot write to CAPTURE_DIR: $CAPTURE_DIR"
  exit 1
}

# Step 1: Launch browser and capture views using playwright
debug "🖥️ Launching browser for capture..."

# Create a temporary capture script file to avoid quoting issues in -e
CAPTURE_SCRIPT="$(mktemp /tmp/capture-XXXXXX.mjs)"
cat > "$CAPTURE_SCRIPT" <<'SCRIPT_END'
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const url = process.env.CAPTURE_URL;
const output = process.env.CAPTURE_DIR;

if (!url || !output) {
  console.error('CAPTURE_URL and CAPTURE_DIR must be set');
  process.exit(1);
}

const transient = error => {
  const msg = error.message || String(error);
  // Exit 75 for temporary navigation/browser infrastructure failures
  if (/navigation|browser|timeout|pageerror|connect/.test(msg)) {
    const e = new Error(msg);
    e.exitCode = 75;
    throw e;
  }
  // Exit 1 for script or rendering defects
  const e = new Error(msg);
  e.exitCode = 1;
  throw e;
};

let browser;
try {
  // Browser launch config
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  browser = await chromium.launch(launchOptions).catch(transient);

  // Capture desktop view (1440x900)
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  desktopPage.setDefaultTimeout(30000);

  const desktopFailures = [];
  desktopPage.on('pageerror', error => {
    console.error('Desktop page error:', error.message);
    desktopFailures.push(error.message);
  });
  desktopPage.on('response', response => {
    if (response.status() >= 400) {
      desktopFailures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  const desktopResponse = await desktopPage.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient);
  if (!desktopResponse?.ok()) {
    throw Object.assign(new Error(`HTTP ${desktopResponse?.status()} loading preview`), { exitCode: 75 });
  }

  // Wait for body to be visible and fonts to load
  await desktopPage.locator('body').waitFor({ state: 'visible' });
  await desktopPage.waitForFunction(() => document.fonts.status === 'loaded');

  // Capture desktop screenshot
  await desktopPage.screenshot({ path: join(output, 'final-desktop.png'), timeout: 30000 });
  await desktopPage.close();

  // Capture mobile view (390x844 - iPhone 12/13/14 proportion)
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobilePage.setDefaultTimeout(30000);

  const mobileFailures = [];
  mobilePage.on('pageerror', error => {
    console.error('Mobile page error:', error.message);
    mobileFailures.push(error.message);
  });
  mobilePage.on('response', response => {
    if (response.status() >= 400) {
      mobileFailures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  const mobileResponse = await mobilePage.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient);
  if (!mobileResponse?.ok()) {
    throw Object.assign(new Error(`HTTP ${mobileResponse?.status()} loading preview`), { exitCode: 75 });
  }

  // Wait for body to be visible and fonts to load
  await mobilePage.locator('body').waitFor({ state: 'visible' });
  await mobilePage.waitForFunction(() => document.fonts.status === 'loaded');

  // Capture mobile screenshot
  await mobilePage.screenshot({ path: join(output, 'final-mobile.png'), timeout: 30000 });
  await mobilePage.close();

  console.log('Capture completed successfully: final-desktop.png, final-mobile.png');

} catch (error) {
  debug('Playwright capture error:', error);
  // Exit 75 for temporary navigation/browser infrastructure failures
  if (error.exitCode === 75) {
    process.exitCode = 75;
  } else {
    // Exit 1 for script or rendering defects
    process.exitCode = 1;
  }
  // Attempt to close browser if open
  browser?.close().catch(() => {});
  process.exit(process.exitCode || 1);
} finally {
  browser?.close().catch(() => {});
  process.exit(process.exitCode || 0);
}
SCRIPT_END

debug "Running playwright capture script..."

# Run the capture script with timeout handling
start_timer "playwright-capture"
node "$CAPTURE_SCRIPT" 2>&1
CAPTURE_RESULT=$?
end_timer "playwright-capture"

# Clean up temp script
rm -f "$CAPTURE_SCRIPT"

debug "🔚 Capture process exited with code: $CAPTURE_RESULT"

# Step 2: Handle exit codes
# Exit 75 = temporary navigation/browser infrastructure failures
# Exit 1 = script or rendering defects
if [ "$CAPTURE_RESULT" -eq 75 ]; then
  debug "⚠️ Temporary navigation/browser infrastructure failure (exit 75)"
  exit 75
elif [ "$CAPTURE_RESULT" -eq 1 ]; then
  debug "❌ Script or rendering defect (exit 1)"
  exit 1
elif [ "$CAPTURE_RESULT" -gt 0 ]; then
  debug "❌ Unknown capture error (exit $CAPTURE_RESULT)"
  exit 1
fi

debug "✅ Capture completed successfully"
exit 0