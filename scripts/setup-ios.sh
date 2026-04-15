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
echo "==> [1/6] Installing npm packages + creating native module symlink..."
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

# ─── Step 2: Check autolinking ──────────────────────────────────────────────
echo "==> [2/6] Checking expo-modules-autolinking..."
echo ""
echo "    All autolinked modules for iOS:"
npx expo-modules-autolinking resolve --platform ios 2>/dev/null | grep -i "name\|podName" || true
echo ""
echo "    Checking for ExpoKgenAdvancedCapture:"
if npx expo-modules-autolinking resolve --platform ios 2>/dev/null | grep -qi "kgen"; then
  echo "    ✅ Autolinking FOUND ExpoKgenAdvancedCapture"
else
  echo "    ⚠️  Autolinking did NOT find ExpoKgenAdvancedCapture — will patch manually"
fi
echo ""

# ─── Step 3: expo prebuild ───────────────────────────────────────────────────
echo "==> [3/6] Generating ios/ directory (expo prebuild)..."
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

# ─── Step 4: Ensure pod line + symlink in Podfile ────────────────────────────
echo "==> [4/6] Adding ExpoKgenAdvancedCapture pod to Podfile..."
node scripts/fix-ios-build.js
echo ""

# ─── Step 5: pod install ─────────────────────────────────────────────────────
echo "==> [5/6] Running pod install..."
cd ios
pod install
cd "$ROOT"
echo ""

# ─── Step 6: Patch ExpoModulesProvider.swift ─────────────────────────────────
echo "==> [6/6] Patching ExpoModulesProvider.swift..."
node scripts/fix-ios-build.js --patch-provider
echo ""

# ─── Verify ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                     ║"
echo "║                                                         ║"
echo "║  IMPORTANT: After Xcode build, verify the patch:        ║"
echo "║                                                         ║"
echo "║  grep ExpoKgen ios/Pods/Target\ Support\ Files/\        ║"
echo "║    */ExpoModulesProvider*.swift                          ║"
echo "║                                                         ║"
echo "║  Also check for a SECOND provider file:                 ║"
echo "║  find ios -name 'ExpoModulesProvider*' -type f          ║"
echo "║                                                         ║"
echo "║  Next steps:                                            ║"
echo "║  1. Open ios/*.xcworkspace in Xcode                     ║"
echo "║  2. ⌘⇧K (Clean Build Folder)                           ║"
echo "║  3. ⌘R (Build & Run)                                   ║"
echo "║  4. Check Xcode console for:                            ║"
echo "║     🟢 Registering module 'ExpoKgenAdvancedCapture'     ║"
echo "║                                                         ║"
echo "║  If module STILL doesn't register, run this AFTER build:║"
echo "║  find ios -name 'ExpoModulesProvider*' -type f          ║"
echo "║  and share the output + contents of each file found.    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
