#!/bin/bash
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
echo "==> [1/5] Installing npm packages + creating native module symlink..."
npm install
echo ""

if [ -L "node_modules/expo-kgen-advanced-capture" ]; then
  echo "    ✅ Symlink: node_modules/expo-kgen-advanced-capture → $(readlink node_modules/expo-kgen-advanced-capture)"
else
  echo "    ⚠️  Symlink not found. Creating manually..."
  ln -sf ../modules/expo-kgen-advanced-capture node_modules/expo-kgen-advanced-capture
  echo "    ✅ Created symlink manually"
fi
echo ""

# ─── Step 2: expo prebuild ───────────────────────────────────────────────────
echo "==> [2/5] Generating ios/ directory (expo prebuild)..."
if [ -d "ios" ]; then
  echo "    ios/ directory already exists."
  read -p "    Regenerate from scratch? (y/N) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf ios
    npx expo prebuild --platform ios --no-install
    echo "    ✅ ios/ regenerated"
  else
    echo "    Keeping existing ios/"
  fi
else
  npx expo prebuild --platform ios --no-install
  echo "    ✅ ios/ generated"
fi
echo ""

# ─── Step 3: Ensure pod line + symlink in Podfile ────────────────────────────
echo "==> [3/5] Adding ExpoKgenAdvancedCapture pod to Podfile..."
node scripts/fix-ios-build.js
echo ""

# ─── Step 4: pod install ─────────────────────────────────────────────────────
echo "==> [4/5] Running pod install..."
cd ios
pod install
cd "$ROOT"
echo ""

# ─── Step 5: Patch ExpoModulesProvider.swift ─────────────────────────────────
echo "==> [5/5] Patching ExpoModulesProvider.swift..."
node scripts/fix-ios-build.js --patch-provider
echo ""

# ─── Verify ──────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                     ║"
echo "║                                                         ║"
echo "║  Next steps:                                            ║"
echo "║  1. Open ios/*.xcworkspace in Xcode                     ║"
echo "║  2. Select your iPhone as the target device             ║"
echo "║  3. ⌘⇧K (Clean Build Folder)                           ║"
echo "║  4. ⌘R (Build & Run)                                   ║"
echo "║                                                         ║"
echo "║  The Record screen should show ● ARKit (green).         ║"
echo "║  If it shows ● Expo Camera with a red error,            ║"
echo "║  send me the red error text from the Record screen.     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
