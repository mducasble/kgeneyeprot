#!/bin/bash
# ─── KGeN iOS Build Setup ─────────────────────────────────────────────────────
# Run once after `git pull` to register ExpoKgenAdvancedCaptureModule (ARKit).
#
# Usage:
#   chmod +x scripts/setup-ios.sh
#   ./scripts/setup-ios.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "==> [1/4] Installing npm packages + creating native module symlink..."
npm install

echo ""
echo "==> [2/4] Running pod install..."
cd ios
pod install
cd "$ROOT"

echo ""
echo "==> [3/4] Patching ExpoModulesProvider.swift with ExpoKgenAdvancedCaptureModule..."
node scripts/fix-ios-build.js --patch-provider

echo ""
echo "==> [4/4] Done!"
echo ""
echo "    Now open Xcode, do a clean build (⌘⇧K) and run (⌘R)."
echo "    The status indicator in the Record screen should show ● ARKit (green)."
