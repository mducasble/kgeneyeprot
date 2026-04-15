#!/bin/bash
# ─── KGeN iOS Native Build Setup ────────────────────────────────────────────
# Run once on a Mac after cloning or pulling to get ARKit working.
#
# Prerequisites:
#   - macOS with Xcode installed (14+)
#   - CocoaPods installed (gem install cocoapods)
#   - An iPhone connected (ARKit requires a real device, not Simulator)
#
# Usage:
#   chmod +x scripts/setup-ios.sh
#   ./scripts/setup-ios.sh
#
# What this does:
#   1. npm install (creates portable symlink for the native module)
#   2. npx expo prebuild --platform ios (generates ios/ directory with autolinking)
#   3. cd ios && pod install (installs CocoaPods including ExpoKgenAdvancedCapture)
#   4. Patches ExpoModulesProvider.swift if autolinking missed the module
#
# After this script:
#   Open ios/kgendatacollector.xcworkspace in Xcode → ⌘⇧K (clean) → ⌘R (run)
# ─────────────────────────────────────────────────────────────────────────────

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         KGeN iOS Native Build Setup (ARKit)             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: npm install ─────────────────────────────────────────────────────
echo "==> [1/4] Installing npm packages + creating native module symlink..."
npm install
echo ""

# Verify the symlink exists
if [ -L "node_modules/expo-kgen-advanced-capture" ]; then
  echo "    ✅ Symlink: node_modules/expo-kgen-advanced-capture → $(readlink node_modules/expo-kgen-advanced-capture)"
else
  echo "    ⚠️  Symlink not found. Creating manually..."
  ln -sf ../modules/expo-kgen-advanced-capture node_modules/expo-kgen-advanced-capture
  echo "    ✅ Created symlink manually"
fi
echo ""

# ─── Step 2: expo prebuild ───────────────────────────────────────────────────
echo "==> [2/4] Running expo prebuild (generates ios/ directory with autolinking)..."
if [ -d "ios" ]; then
  echo "    ios/ directory already exists. Skipping prebuild."
  echo "    (To regenerate, delete ios/ first: rm -rf ios)"
else
  npx expo prebuild --platform ios --no-install
  echo "    ✅ ios/ directory generated"
fi
echo ""

# ─── Step 3: pod install ─────────────────────────────────────────────────────
echo "==> [3/4] Running pod install..."
cd ios
pod install
cd "$ROOT"
echo ""

# ─── Step 4: Patch provider if needed ────────────────────────────────────────
echo "==> [4/4] Patching ExpoModulesProvider.swift (safety check)..."
node scripts/fix-ios-build.js --patch-provider
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                     ║"
echo "║                                                         ║"
echo "║  Next steps:                                            ║"
echo "║  1. Open ios/*.xcworkspace in Xcode                     ║"
echo "║  2. Select your iPhone as the target device             ║"
echo "║  3. ⌘⇧K (Clean Build Folder)                           ║"
echo "║  4. ⌘R (Build & Run)                                   ║"
echo "║                                                         ║"
echo "║  The Record screen should show ● ARKit (green)          ║"
echo "║  instead of ● Expo Camera (yellow).                     ║"
echo "║                                                         ║"
echo "║  NOTE: ARKit requires a REAL iPhone. It does NOT work   ║"
echo "║  in the iOS Simulator, Expo Go, or web preview.         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
