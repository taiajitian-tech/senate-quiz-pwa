import fs from "fs";

const path = "web/public/data/representatives.json";
const data = JSON.parse(fs.readFileSync(path, "utf8"));

if (!Array.isArray(data)) {
  throw new Error("not array");
}

console.log("count:", data.length);

if (data.length < 400) {
  throw new Error("too few representatives");
}

const names = new Set();

for (const r of data) {
  if (!r?.name || !r?.kana || !r?.party) {
    throw new Error("invalid record");
  }

  if (r.house !== "衆議院") {
    throw new Error("invalid house: " + r.name);
  }

  if (names.has(r.name)) {
    throw new Error("duplicate name: " + r.name);
  }

  names.add(r.name);
}

console.log("validation ok");
