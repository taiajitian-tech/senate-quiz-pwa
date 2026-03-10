import fs from "fs";
import path from "path";

const file = path.resolve("web/public/data/representatives.json");
const text = fs.readFileSync(file, "utf8");
const data = JSON.parse(text);

if (!Array.isArray(data)) {
  throw new Error("representatives.json is not an array");
}

if (data.length < 300) {
  throw new Error(`representatives.json too small: ${data.length}`);
}

for (const [index, item] of data.entries()) {
  if (!item || typeof item !== "object") {
    throw new Error(`invalid row at ${index}`);
  }
  if (!item.name || typeof item.name !== "string") {
    throw new Error(`missing name at ${index}`);
  }
}

console.log(`representatives.json OK (${data.length})`);
