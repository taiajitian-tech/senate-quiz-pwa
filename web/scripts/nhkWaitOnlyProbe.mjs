import fs from "fs/promises";

const URLS = [
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html",
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_hirei.html"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithWait(url, waitMs) {
  console.log("start=", url);
  console.log("wait-before-ms=", waitMs);
  await sleep(waitMs);

  const startedAt = Date.now();
  const res = await fetch(url);
  const elapsed = Date.now() - startedAt;

  const text = await res.text();

  return {
    url,
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    elapsedMs: elapsed,
    bodyLength: text.length,
    bodyHead: text.slice(0, 1000),
    body: text
  };
}

async function main() {
  await fs.mkdir("./public/data", { recursive: true });

  const results = [];

  for (const url of URLS) {
    try {
      const result = await fetchWithWait(url, 5000);
      results.push({
        url: result.url,
        ok: result.ok,
        status: result.status,
        statusText: result.statusText,
        elapsedMs: result.elapsedMs,
        bodyLength: result.bodyLength,
        bodyHead: result.bodyHead
      });

      const safeName = url.includes("senkyoku") ? "nhk_senkyoku_probe.html" : "nhk_hirei_probe.html";
      await fs.writeFile(`./public/data/${safeName}`, result.body, "utf-8");

      console.log("url=", result.url);
      console.log("status=", result.status, result.statusText);
      console.log("elapsed-ms=", result.elapsedMs);
      console.log("body-length=", result.bodyLength);
    } catch (error) {
      results.push({
        url,
        error: String(error?.message || error)
      });
      console.log("url=", url);
      console.log("error=", String(error?.message || error));
    }
  }

  await fs.writeFile(
    "./public/data/nhk_wait_only_probe_report.json",
    JSON.stringify(results, null, 2) + "\n",
    "utf-8"
  );

  console.log("done-count=", results.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
