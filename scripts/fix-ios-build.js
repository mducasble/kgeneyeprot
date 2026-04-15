const fs = require("fs");
const path = require("path");

function fixFile(relPath, oldText, newText) {
  const fullPath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(fullPath)) {
    return;
  }
  const original = fs.readFileSync(fullPath, "utf8");
  if (!original.includes(oldText)) {
    return;
  }
  fs.writeFileSync(fullPath, original.replace(oldText, newText), "utf8");
  console.log(`patched: ${relPath}`);
}

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

// ─── 1. Inject ExpoKgenAdvancedCapture pod into Podfile ───────────────────────

const podfilePath = path.join(__dirname, "..", "ios", "Podfile");
const podLine = "  pod 'ExpoKgenAdvancedCapture', :path => '../modules/expo-kgen-advanced-capture'";

const postInstallHook = `
# Auto-patch ExpoModulesProvider.swift to register local native modules
post_install do |installer|
  system("cd .. && node scripts/fix-ios-build.js --patch-provider-only")
  ReactNativePodsUtils.fix_react_include_paths(installer) rescue nil
  ReactNativePodsUtils.apply_xcode_14_workaround(installer) rescue nil
end`;

if (fs.existsSync(podfilePath)) {
  const podfile = fs.readFileSync(podfilePath, "utf8");

  let updated = podfile;
  let changed = false;

  if (!podfile.includes("ExpoKgenAdvancedCapture")) {
    updated = updated.replace("use_expo_modules!", `use_expo_modules!\n${podLine}`);
    changed = true;
    console.log("patched: ios/Podfile — added ExpoKgenAdvancedCapture pod");
  }

  if (!podfile.includes("patch-provider-only")) {
    // Remove any existing post_install block that doesn't have our hook, then append ours
    // Only add if there's no post_install at all (to avoid duplicates)
    if (!podfile.includes("post_install do")) {
      updated = updated + postInstallHook + "\n";
      changed = true;
      console.log("patched: ios/Podfile — added post_install hook");
    } else {
      // Insert our command into the existing post_install block
      updated = updated.replace(
        /post_install do \|installer\|/,
        `post_install do |installer|\n  system("cd .. && node scripts/fix-ios-build.js --patch-provider-only")`
      );
      changed = true;
      console.log("patched: ios/Podfile — injected provider patch into post_install");
    }
  }

  if (changed) {
    fs.writeFileSync(podfilePath, updated, "utf8");
  }
}

// ─── 2. Patch ExpoModulesProvider.swift ──────────────────────────────────────

const patchProviderOnly = process.argv.includes("--patch-provider-only");

function patchExpoModulesProvider() {
  const iosDir = path.join(__dirname, "..", "ios");
  if (!fs.existsSync(iosDir)) {
    if (!patchProviderOnly) {
      console.log("[ExpoKgen] ios/ not found — run this script from your Mac after pod install");
    }
    return;
  }

  // Recursively search for ExpoModulesProvider.swift (skip Pods/ to avoid patching the wrong file)
  function findProvider(dir, depth = 0) {
    if (depth > 4) return null;
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
    console.log("[ExpoKgen] ExpoModulesProvider.swift not found.");
    console.log("[ExpoKgen] Run 'cd ios && pod install' first, then re-run this script.");
    return;
  }

  const content = fs.readFileSync(providerPath, "utf8");

  if (content.includes("ExpoKgenAdvancedCaptureModule")) {
    console.log("[ExpoKgen] ✅ ExpoModulesProvider.swift already has ExpoKgenAdvancedCaptureModule");
    return;
  }

  // Pattern 1: ClassName.self, (Expo SDK 50+ New Architecture format)
  const selfPattern = /^(\s+)(\w+\.self,)/m;
  // Pattern 2: ClassName(), (older format)
  const instancePattern = /^(\s+)(\w+\(\),)/m;

  const m1 = content.match(selfPattern);
  const m2 = content.match(instancePattern);

  if (m1) {
    const indent = m1[1];
    const patched = content.replace(selfPattern, `${indent}ExpoKgenAdvancedCaptureModule.self,\n${indent}${m1[2]}`);
    fs.writeFileSync(providerPath, patched, "utf8");
    console.log("[ExpoKgen] ✅ ExpoModulesProvider.swift patched (Pattern 1 — .self)");
    console.log("[ExpoKgen]    → Clean Xcode build required: ⌘⇧K then ⌘R");
  } else if (m2) {
    const indent = m2[1];
    const patched = content.replace(instancePattern, `${indent}ExpoKgenAdvancedCaptureModule(),\n${indent}${m2[2]}`);
    fs.writeFileSync(providerPath, patched, "utf8");
    console.log("[ExpoKgen] ✅ ExpoModulesProvider.swift patched (Pattern 2 — instance)");
    console.log("[ExpoKgen]    → Clean Xcode build required: ⌘⇧K then ⌘R");
  } else {
    // Fallback: dump first 600 chars so we can diagnose
    console.log("[ExpoKgen] ⚠️  Could not find insertion point in ExpoModulesProvider.swift");
    console.log("[ExpoKgen]    First 600 chars of file:");
    console.log(content.substring(0, 600));
    console.log("[ExpoKgen]    File path:", providerPath);
  }
}

patchExpoModulesProvider();
