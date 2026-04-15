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

// Inject ExpoKgenAdvancedCapture pod into Podfile if not already present
const podfilePath = path.join(__dirname, "..", "ios", "Podfile");
const podLine = "  pod 'ExpoKgenAdvancedCapture', :path => '../modules/expo-kgen-advanced-capture'";
const anchor = "use_expo_modules!";

if (fs.existsSync(podfilePath)) {
  const podfile = fs.readFileSync(podfilePath, "utf8");
  if (!podfile.includes("ExpoKgenAdvancedCapture")) {
    const patched = podfile.replace(anchor, `${anchor}\n${podLine}`);
    fs.writeFileSync(podfilePath, patched, "utf8");
    console.log("patched: ios/Podfile — added ExpoKgenAdvancedCapture pod");
    console.log("Run 'cd ios && pod install' to complete the native module setup.");
  }
}
