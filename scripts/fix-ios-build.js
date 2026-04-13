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
