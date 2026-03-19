import puppeteer from "puppeteer";
import fs from "fs";

const clean = s => s.replace(/\s+/g, "").trim();

const browser = await puppeteer.launch();
const page = await browser.newPage();

const urls = [];

for (let i = 0; i <= 50; i++) {
  const n = String(i).padStart(2, "0");
  urls.push(`https://news.web.nhk/senkyo/database/shugiin/${n}/tousen_toukaku_senkyoku.html`);
  urls.push(`https://news.web.nhk/senkyo/database/shugiin/${n}/tousen_toukaku_hirei.html`);
}

const results = [];

for (const url of urls) {
  try {
    await page.goto(url, { waitUntil: "networkidle2" });

    const r = await page.evaluate(() => {
      const out = [];

      document.querySelectorAll("img").forEach(img => {
        if (!img.src.includes("/photo/")) return;
        if (!img.alt) return;

        out.push({
          name: img.alt.replace(/\s+/g, "").trim(),
          image: img.src
        });
      });

      return out;
    });

    results.push(...r);

  } catch (e) {
    console.log("skip:", url);
  }
}

await browser.close();

const data = JSON.parse(fs.readFileSync("web/public/data/representatives.json"));

for (const r of results) {
  const t = data.find(m => clean(m.name) === clean(r.name));
  if (t) {
    t.image = r.image;
    console.log("SET:", t.name);
  }
}

fs.writeFileSync("web/public/data/representatives.json", JSON.stringify(data, null, 2));

console.log("done");
