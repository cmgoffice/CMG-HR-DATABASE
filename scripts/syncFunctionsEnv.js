const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, ".env");
const targetDir = path.join(root, "functions");
const targetPath = path.join(targetDir, ".env");
const allowedKeys = new Set([
  "ZK_API_BASE_URL",
  "ZK_API_USERNAME",
  "ZK_API_PASSWORD",
  "ZK_API_AUTH_SCHEME",
  "ZK_ALLOWED_ORIGINS",
]);

if (!fs.existsSync(sourcePath)) {
  throw new Error("ไม่พบไฟล์ root .env สำหรับตั้งค่า ZKBioTime");
}

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
const selected = lines.filter((line) => {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
  return match && allowedKeys.has(match[1]);
});
const presentKeys = new Set(selected.map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=/)[1]));
for (const key of ["ZK_API_BASE_URL", "ZK_API_USERNAME", "ZK_API_PASSWORD"]) {
  if (!presentKeys.has(key)) throw new Error(`ไม่พบ ${key} ใน root .env`);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(targetPath, `${selected.join("\n")}\n`, "utf8");
