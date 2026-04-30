const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const iconDir = path.resolve(rootDir, "src-tauri/icons");
const sourceLogo = path.resolve(iconDir, "logo.png");

const desktopKeepFiles = new Set([
  "logo.png",
  "README.md",
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.png",
  "icon.ico",
  "icon.icns",
]);

/**
 * 生成 Tauri 图标资源。
 * 先调用官方 tauri icon 生成全量图标，再执行桌面端精简清理。
 * @returns {void}
 */
function generateIcons() {
  execSync(`pnpm tauri icon "${sourceLogo}"`, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

/**
 * 删除非桌面端图标，仅保留桌面端打包所需资源。
 * @returns {void}
 */
function cleanupNonDesktopIcons() {
  const entries = fs.readdirSync(iconDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(iconDir, entry.name);

    if (entry.isDirectory()) {
      // 移除 iOS / Android 等移动端目录
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`[clean] removed dir: ${entry.name}`);
      continue;
    }

    if (!desktopKeepFiles.has(entry.name)) {
      // 移除 Windows Appx 等非桌面必需图标
      fs.rmSync(fullPath, { force: true });
      console.log(`[clean] removed file: ${entry.name}`);
    }
  }
}

/**
 * 脚本入口。
 * @returns {void}
 */
function main() {
  if (!fs.existsSync(sourceLogo)) {
    throw new Error(`未找到图标源文件: ${sourceLogo}`);
  }

  generateIcons();
  cleanupNonDesktopIcons();
  console.log("[done] desktop icons generated successfully.");
}

main();
