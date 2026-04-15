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

const symlinkDest = path.join(ROOT, "node_modules", "expo-kgen-advanced-capture");
const symlinkRelTarget = path.join("..", "modules", "expo-kgen-advanced-capture");

try {
  const stat = fs.lstatSync(symlinkDest);
  if (stat.isSymbolicLink()) {
    const current = fs.readlinkSync(symlinkDest);
    if (current !== symlinkRelTarget) {
      fs.unlinkSync(symlinkDest);
      fs.symlinkSync(symlinkRelTarget, symlinkDest, "dir");
      console.log(`re-created symlink: node_modules/expo-kgen-advanced-capture -> ${symlinkRelTarget}`);
    } else {
      console.log("symlink ok: node_modules/expo-kgen-advanced-capture");
    }
  } else {
    console.log("[ExpoKgen] node_modules/expo-kgen-advanced-capture exists but is not a symlink — skipping");
  }
} catch (_e) {
  try {
    fs.symlinkSync(symlinkRelTarget, symlinkDest, "dir");
    console.log(`created symlink: node_modules/expo-kgen-advanced-capture -> ${symlinkRelTarget}`);
  } catch (e) {
    console.warn("[ExpoKgen] Could not create symlink:", e.message);
  }
}

const podfilePath = path.join(ROOT, "ios", "Podfile");
const podLine = "  pod 'ExpoKgenAdvancedCapture', :path => '../modules/expo-kgen-advanced-capture'";

if (fs.existsSync(podfilePath)) {
  let podfile = fs.readFileSync(podfilePath, "utf8");
  let changed = false;

  if (!podfile.includes("ExpoKgenAdvancedCapture")) {
    podfile = podfile.replace("use_expo_modules!", `use_expo_modules!\n${podLine}`);
    changed = true;
    console.log("patched: ios/Podfile — added ExpoKgenAdvancedCapture pod");
  }

  const brokenHookPattern = /\n\s*system\("cd \.\. && node scripts\/fix-ios-build\.js --patch-provider-only"\)\n/g;
  if (brokenHookPattern.test(podfile)) {
    podfile = podfile.replace(brokenHookPattern, "\n");
    changed = true;
    console.log("patched: ios/Podfile — removed stale post_install hook");
  }

  const autoBlockPattern = /\n# Auto-patch ExpoModulesProvider\.swift[\s\S]*?^end\n/m;
  if (autoBlockPattern.test(podfile)) {
    podfile = podfile.replace(autoBlockPattern, "\n");
    changed = true;
    console.log("patched: ios/Podfile — removed auto-generated post_install block");
  }

  const kgenPostInstallMarker = "# [ExpoKgen] Auto-register native module";
  if (!podfile.includes(kgenPostInstallMarker)) {
    const postInstallRegex = /post_install\s+do\s+\|installer\|/;
    const postInstallMatch = podfile.match(postInstallRegex);
    if (postInstallMatch) {
      const insertIdx = podfile.indexOf(postInstallMatch[0]) + postInstallMatch[0].length;
      const rubyHook = `
  ${kgenPostInstallMarker}
  kgen_provider_dir = File.join(installer.sandbox.root.to_s, 'Target Support Files')
  Dir.glob(File.join(kgen_provider_dir, '**', 'ExpoModulesProvider*.swift')).each do |kgen_path|
    kgen_content = File.read(kgen_path)
    unless kgen_content.include?('ExpoKgenAdvancedCaptureModule')
      kgen_content.sub!(/^(import \\w+)\\s*$/m, "\\\\1\\nimport ExpoKgenAdvancedCapture")
      kgen_content.sub!(/(\\w+Module\\.self)/, "ExpoKgenAdvancedCaptureModule.self,\\n      \\\\1")
      File.write(kgen_path, kgen_content)
      Pod::UI.puts "[ExpoKgen] Patched #{File.basename(kgen_path)}"
    end
  end
  # [/ExpoKgen]`;
      podfile = podfile.slice(0, insertIdx) + rubyHook + podfile.slice(insertIdx);
      changed = true;
      console.log("patched: ios/Podfile — added ExpoKgen post_install hook");
    }
  }

  if (changed) {
    fs.writeFileSync(podfilePath, podfile, "utf8");
  }
}

const patchProvider = process.argv.includes("--patch-provider") ||
                      process.argv.includes("--patch-provider-only");

if (patchProvider) {
  const iosDir = path.join(ROOT, "ios");
  if (!fs.existsSync(iosDir)) {
    console.log("[ExpoKgen] ios/ not found — run this on the Mac after `pod install`.");
    process.exit(0);
  }

  function findAllProviders(dir, depth = 0) {
    const results = [];
    if (depth > 8) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (/^ExpoModulesProvider.*\.swift$/.test(entry.name)) {
          results.push(path.join(dir, entry.name));
        }
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "build" &&
          entry.name !== "DerivedData"
        ) {
          results.push(...findAllProviders(path.join(dir, entry.name), depth + 1));
        }
      }
    } catch {}
    return results;
  }

  const providerFiles = findAllProviders(iosDir);

  if (providerFiles.length === 0) {
    console.log("[ExpoKgen] No ExpoModulesProvider*.swift files found under ios/");
    console.log("[ExpoKgen] Run 'cd ios && pod install' first, then run this script again.");
    process.exit(1);
  }

  console.log(`[ExpoKgen] Found ${providerFiles.length} provider file(s):`);
  providerFiles.forEach((f) => console.log(`  → ${f}`));

  let patchedCount = 0;

  for (const providerPath of providerFiles) {
    const content = fs.readFileSync(providerPath, "utf8");

    if (content.includes("ExpoKgenAdvancedCaptureModule")) {
      console.log(`[ExpoKgen] ✅ ${path.basename(providerPath)} already patched`);
      continue;
    }

    console.log(`\n[ExpoKgen] Patching: ${providerPath}`);
    console.log("[ExpoKgen] Current content:");
    console.log("─".repeat(60));
    console.log(content);
    console.log("─".repeat(60));

    let patched = content;

    if (!patched.includes("import ExpoKgenAdvancedCapture")) {
      const lastImportMatch = patched.match(/^(import\s+\w+)\s*$/gm);
      if (lastImportMatch && lastImportMatch.length > 0) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        patched = patched.replace(lastImport, `${lastImport}\nimport ExpoKgenAdvancedCapture`);
        console.log("[ExpoKgen] Added: import ExpoKgenAdvancedCapture");
      } else {
        patched = `import ExpoKgenAdvancedCapture\n${patched}`;
        console.log("[ExpoKgen] Added: import ExpoKgenAdvancedCapture (at top)");
      }
    }

    const selfComma = /^(\s+)(\w+Module\.self,)/m;
    const selfNoComma = /^(\s+)(\w+Module\.self)\s*$/m;
    const anySelfComma = /^(\s+)(\w+\.self,)/m;
    const returnArray = /^(\s*)(return\s*\[)\s*$/m;

    const m1 = patched.match(selfComma);
    const m2 = patched.match(selfNoComma);
    const m4 = patched.match(anySelfComma);
    const m5 = patched.match(returnArray);

    if (m1) {
      const indent = m1[1];
      patched = patched.replace(selfComma, `${indent}ExpoKgenAdvancedCaptureModule.self,\n${indent}${m1[2]}`);
      console.log("[ExpoKgen] Injected module class (pattern: Module.self,)");
    } else if (m2) {
      const indent = m2[1];
      patched = patched.replace(selfNoComma, `${indent}ExpoKgenAdvancedCaptureModule.self,\n${indent}${m2[2]}`);
      console.log("[ExpoKgen] Injected module class (pattern: Module.self no comma)");
    } else if (m4) {
      const indent = m4[1];
      patched = patched.replace(anySelfComma, `${indent}ExpoKgenAdvancedCaptureModule.self,\n${indent}${m4[2]}`);
      console.log("[ExpoKgen] Injected module class (pattern: .self,)");
    } else if (m5) {
      const indent = m5[1];
      patched = patched.replace(returnArray, `${indent}${m5[2]}\n${indent}      ExpoKgenAdvancedCaptureModule.self,`);
      console.log("[ExpoKgen] Injected module class (pattern: return [)");
    } else {
      console.log("[ExpoKgen] ⚠️ Could not auto-inject module class — no known pattern matched");
      continue;
    }

    fs.writeFileSync(providerPath, patched, "utf8");
    patchedCount++;

    console.log("[ExpoKgen] ✅ Patched successfully");
    console.log("[ExpoKgen] Patched content:");
    console.log("─".repeat(60));
    console.log(fs.readFileSync(providerPath, "utf8"));
    console.log("─".repeat(60));
  }

  if (patchedCount > 0) {
    console.log(`\n[ExpoKgen] ✅ Patched ${patchedCount} provider file(s)`);
    console.log("[ExpoKgen]    → Clean Xcode build required: ⌘⇧K then ⌘R");
  }
}
