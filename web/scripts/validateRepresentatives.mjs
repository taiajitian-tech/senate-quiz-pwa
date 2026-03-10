import fs from "fs";
import path from "path";

const file = path.resolve("public/data/representatives.json");
const text = fs.readFileSync(file, "utf8");
const data = JSON.parse(text);

const MIN_EXPECTED = 430;
const MAX_EXPECTED = 520;

if (!Array.isArray(data)) {
  throw new Error("representatives.json is not an array");
}

if (data.length < MIN_EXPECTED) {
  throw new Error(`representatives.json too small: ${data.length}`);
}

if (data.length > MAX_EXPECTED) {
  throw new Error(`representatives.json too large: ${data.length}`);
}

const seen = new Set();

for (const [index, item] of data.entries()) {
  if (!item || typeof item !== "object") {
    throw new Error(`invalid row at ${index}`);
  }
  if (!item.name || typeof item.name !== "string") {
    throw new Error(`missing name at ${index}`);
  }
  if (!item.kana || typeof item.kana !== "string") {
    throw new Error(`missing kana at ${index}`);
  }
  if (!item.party || typeof item.party !== "string") {
    throw new Error(`missing party at ${index}`);
  }
  if (item.house !== "衆議院") {
    throw new Error(`invalid house at ${index}`);
  }

  const key = `${item.name}__${item.kana}`;
  if (seen.has(key)) {
    throw new Error(`duplicate representative: ${key}`);
  }
  seen.add(key);
}

console.log(`representatives.json OK (${data.length})`);
