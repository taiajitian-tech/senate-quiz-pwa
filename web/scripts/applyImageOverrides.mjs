import fs from "node:fs";
import path from "node:path";

const DATA_PATH = path.resolve("public/data/representatives.json");
const OVERRIDE_PATH = path.resolve("public/data/image-overrides.json");

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const overrides = JSON.parse(fs.readFileSync(OVERRIDE_PATH, "utf8"));

  const map = new Map(overrides.map(o => [o.name, o.image]));

  let count = 0;

  for (const m of data) {
    if (map.has(m.name) && map.get(m.name)) {
      m.image = map.get(m.name);
      m.imageSource = "override";
      m.imageSourceUrl = map.get(m.name);
      count++;
      console.log("override:", m.name);
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log("done:", count);
}

main();
