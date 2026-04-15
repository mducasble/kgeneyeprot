const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function fixFile(relPath, oldText, newText) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return;
  const original = fs.readFileSync(fullPath, "utf8");
  if (!original.includes(oldText)) return;
  fs.writeFileSync(fullPath, original.replace(oldText, newText), "utf8");
  console.log(`patched: ${relPath}`);
}

// ─── expo-file-system patches ──────────────────────────────────────────────────

fixFile(
  "node_modules/expo-file-system/ios/FileSystemModule.swift",
  "if fileSystemManager.getPathPermissions(url.path).contains(.read) {",
  "if (fileSystemManager as? EXFilePermissionModuleInterface)?.getPathPermissions(url.path).contains(.read) ?? true {"
);

fixFile(
  "node_modules/expo-file-system/ios/Legacy/FileSystemHelpers.swift",
  "guard fileSystemManager.getPathPermissions(path).contains(flag) else {",
  "guard (fileSystemManager as? EXFilePermissionModuleInterface)?.getPathPermissions(path).contains(flag) ?? true else {"
);

// ─── 1. Symlink node_modules/expo-kgen-advanced-capture ───────────────────────
// This lets Expo's autolinking discover the local native module and register
// ExpoKgenAdvancedCaptureModule in ExpoModulesProvider.swift when pod install runs.

const symlinkDest = path.join(ROOT, "node_modules", "expo-kgen-advanced-capture");
const symlinkTarget = path.join(ROOT, "modules", "expo-kgen-advanced-capture");

if (!fs.existsSync(symlinkDest)) {
  try {
    fs.symlinkSync(symlinkTarget, symlinkDest, "dir");
    console.log("created: node_modules/expo-kgen-advanced-capture -> modules/expo-kgen-advanced-capture");
  } catch (e) {
    console.warn("[ExpoKgen] Could not create symlink:", e.message);
  }
} else {
  // Make sure the symlink still points to the right place
  try {
    const stat = fs.lstatSync(symlinkDest);
    if (!stat.isSymbolicLink()) {
      console.log("[ExpoKgen] node_modules/expo-kgen-advanced-capture exists but is not a symlink — skipping");
    }
  } catch {}
}

// ─── 2. Inject pod into Podfile + clean up old post_install hook ──────────────

const podfilePath = path.join(ROOT, "ios", "Podfile");
const podLine = "  pod 'ExpoKgenAdvancedCapture', :path => '../modules/expo-kgen-advanced-capture'";

if (fs.existsSync(podfilePath)) {
  let podfile = fs.readFileSync(podfilePath, "utf8");
  let changed = false;

  // Add pod declaration if missing
  if (!podfile.includes("ExpoKgenAdvancedCapture")) {
    podfile = podfile.replace("use_expo_modules!", `use_expo_modules!\n${podLine}`);
    changed = true;
    console.log("patched: ios/Podfile — added ExpoKgenAdvancedCapture pod");
  }

  // Remove the broken post_install hook injected by previous script versions
  // It caused "ExpoModulesProvider.swift not found" because it ran before autolinking
  const brokenHookPattern = /\n\s*system\("cd \.\. && node scripts\/fix-ios-build\.js --patch-provider-only"\)\n/g;
  if (brokenHookPattern.test(podfile)) {
    podfile = podfile.replace(brokenHookPattern, "\n");
    changed = true;
    console.log("patched: ios/Podfile — removed stale post_install hook");
  }

  // Also remove any standalone auto-generated post_install block we may have added
  const autoBlockPattern = /\n# Auto-patch ExpoModulesProvider\.swift[\s\S]*?^end\n/m;
  if (autoBlockPattern.test(podfile)) {
    podfile = podfile.replace(autoBlockPattern, "\n");
    changed = true;
    console.log("patched: ios/Podfile — removed auto-generated post_install block");
  }

  if (changed) {
    fs.writeFileSync(podfilePath, podfile, "utf8");
  }
}

// ─── 3. Direct ExpoModulesProvider.swift patch (fallback) ────────────────────
// Runs when called with --patch-provider or --patch-provider-only.
// Use this AFTER pod install if the symlink approach above did not work:
//   node scripts/fix-ios-build.js --patch-provider

const patchProvider = process.argv.includes("--patch-provider") ||
                      process.argv.includes("--patch-provider-only");

if (patchProvider) {
  const iosDir = path.join(ROOT, "ios");
  if (!fs.existsSync(iosDir)) {
    console.log("[ExpoKgen] ios/ not found — are you on the Mac?");
    process.exit(0);
  }

  // Search for ExpoModulesProvider.swift (skip Pods/ and DerivedData/)
  function findProvider(dir, depth = 0) {
    if (depth > 5) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "ExpoModulesProvider.swift") {
          return path.join(dir, entry.name);
        }
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "Pods" &&
          entry.name !== "build" &&
          entry.name !== "DerivedData"
        ) {
          const found = findProvider(path.join(dir, entry.name), depth + 1);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  }

  const providerPath = findProvider(iosDir);

  if (!providerPath) {
    // List ios/ contents to help diagnose
    console.log("[ExpoKgen] ExpoModulesProvider.swift not found. Contents of ios/:");
    try {
      fs.readdirSync(iosDir).forEach((f) => console.log("  ", f));
    } catch {}
    console.log("[ExpoKgen] Run 'cd ios && pod install' first.");
    process.exit(1);
  }

  const content = fs.readFileSync(providerPath, "utf8");

  if (content.includes("ExpoKgenAdvancedCaptureModule")) {
    console.log("[ExpoKgen] ✅ ExpoModulesProvider.swift already contains ExpoKgenAdvancedCaptureModule");
    process.exit(0);
  }

  // Try .self, pattern (Expo SDK 50+ New Architecture)
  const selfPattern = /^(\s+)(\w+\.self,)/m;
  // Try instance pattern (older format)
  const instancePattern = /^(\s+)(\w+\(\),)/m;

  const m1 = content.match(selfPattern);
  const m2 = content.match(instancePattern);

  if (m1) {
    const indent = m1[1];
    const patched = content.replace(selfPattern, `${indent}ExpoKgenAdvancedCaptureModule.self,\n${indent}${m1[2]}`);
    fs.writeFileSync(providerPath, patched, "utf8");
    console.log("[ExpoKgen] ✅ ExpoModulesProvider.swift patched — ExpoKgenAdvancedCaptureModule added");
    console.log("[ExpoKgen]    Path:", providerPath);
    console.log("[ExpoKgen]    → Clean Xcode build required: ⌘⇧K then ⌘R");
  } else if (m2) {
    const indent = m2[1];
    const patched = content.replace(instancePattern, `${indent}ExpoKgenAdvancedCaptureModule(),\n${indent}${m2[2]}`);
    fs.writeFileSync(providerPath, patched, "utf8");
    console.log("[ExpoKgen] ✅ ExpoModulesProvider.swift patched — ExpoKgenAdvancedCaptureModule added");
    console.log("[ExpoKgen]    Path:", providerPath);
    console.log("[ExpoKgen]    → Clean Xcode build required: ⌘⇧K then ⌘R");
  } else {
    console.log("[ExpoKgen] ⚠️ Could not auto-patch. Showing first 800 chars of provider file:");
    console.log(content.substring(0, 800));
    console.log("[ExpoKgen]    Path:", providerPath);
    console.log("[ExpoKgen]    Add manually: ExpoKgenAdvancedCaptureModule.self (or ExpoKgenAdvancedCaptureModule())");
  }
}
