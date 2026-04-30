import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "src-tauri", "target", "release");
const bundleDir = path.join(releaseDir, "bundle");

/**
 * Path to the main app binary next to `bundle/` (not inside installer outputs).
 * @returns {string}
 */
function getMainReleaseBinaryPath() {
  const binaryName = process.platform === "win32" ? "nrm-desktop.exe" : "nrm-desktop";
  return path.join(releaseDir, binaryName);
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run tauri build command and inherit terminal output.
 * @returns {Promise<void>}
 */
function runTauriBuild() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  return new Promise((resolve, reject) => {
    const child = spawn(command, ["tauri", "build"], {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`构建进程被信号中断: ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`tauri build 失败，退出码: ${code ?? "unknown"}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Recursively collect generated artifact file paths.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectArtifacts(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectArtifacts(fullPath);
      }
      return [fullPath];
    }),
  );

  return files.flat();
}

/**
 * Print main binary path plus bundle files.
 * @returns {Promise<void>}
 */
async function printArtifacts() {
  const mainBinary = getMainReleaseBinaryPath();
  const hasMainBinary = await pathExists(mainBinary);

  let artifacts = [];
  let hasBundleDir = false;
  try {
    artifacts = await collectArtifacts(bundleDir);
    hasBundleDir = true;
  } catch {
    hasBundleDir = false;
  }

  const sortedArtifacts = artifacts.sort((left, right) => left.localeCompare(right));
  process.stdout.write("\n=== 打包产物 ===\n");

  if (hasMainBinary) {
    process.stdout.write(`主程序: ${mainBinary}\n`);
  } else {
    process.stdout.write(`[tauri-build] 未找到主程序: ${mainBinary}\n`);
  }

  if (!hasBundleDir) {
    process.stdout.write("[tauri-build] 未找到 bundle 目录（可能未开启安装包或未成功打包）。\n");
    return;
  }

  if (sortedArtifacts.length === 0) {
    process.stdout.write("bundle 目录内未发现额外产物文件，请检查打包配置。\n");
    return;
  }

  process.stdout.write("\nbundle 内文件:\n");
  sortedArtifacts.forEach((artifactPath, index) => {
    process.stdout.write(`${index + 1}. ${artifactPath}\n`);
  });
}

async function main() {
  await runTauriBuild();
  await printArtifacts();
}

main().catch((error) => {
  process.stderr.write(`[tauri-build] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
