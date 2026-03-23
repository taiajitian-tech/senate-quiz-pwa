// fixed fetchNhkWinnersImages.mjs
import puppeteer from "puppeteer";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const url = "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyo.html";
  await page.goto(url, { waitUntil: "networkidle2" });

  await sleep(2000);

  const images = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("img"))
      .map(img => img.src)
      .filter(src => src.includes("/photo/"));
  });

  console.log("raw-cards=", images.length);

  await browser.close();
})();
