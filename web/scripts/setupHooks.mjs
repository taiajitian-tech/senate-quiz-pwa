import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const hookDir = path.join(repoRoot, ".githooks");
const gitDir = path.join(repoRoot, ".git");

if (!fs.existsSync(gitDir) || !fs.existsSync(hookDir)) {
  process.exit(0);
}

const configPath = path.join(gitDir, "config");
const raw = fs.readFileSync(configPath, "utf8");
if (raw.includes("hooksPath = .githooks")) {
  process.exit(0);
}

const next = raw.includes("[core]")
  ? raw.replace(/\[core\][^[]*/m, (m) => (m.includes("hooksPath") ? m : `${m.trimEnd()}
	hooksPath = .githooks

`))
  : `${raw.trimEnd()}

[core]
	hooksPath = .githooks
`;

fs.writeFileSync(configPath, next, "utf8");
console.log("Configured git hooksPath=.githooks");
