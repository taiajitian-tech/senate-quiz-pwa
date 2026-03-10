import fs from "fs";

const path = "web/public/data/representatives.json";

const data = JSON.parse(fs.readFileSync(path,"utf8"));

console.log("count:", data.length);

if (!Array.isArray(data)) {
throw new Error("not array");
}

if (data.length < 400) {
throw new Error("too few representatives");
}

const names = new Set();

for (const r of data) {

if (!r.name || !r.kana) {
throw new Error("invalid record");
}

if (names.has(r.name)) {
throw new Error("duplicate name: " + r.name);
}

names.add(r.name);
}

console.log("validation ok");