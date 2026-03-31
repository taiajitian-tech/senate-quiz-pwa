
/**
 * 修正内容：
 * 衆議院議員の画像取得を「読売DOM固定」に戻す
 * URL推測は禁止
 */

import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const URL = "https://www.yomiuri.co.jp/election/shugiin/";

export async function fetchRepresentativesYomiuri() {
  const res = await fetch(URL);
  const html = await res.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const items = [...document.querySelectorAll("article, li")];

  const results = items.map(el => {
    const img = el.querySelector("img");
    const name = el.textContent?.trim();

    if (!img || !name) return null;

    return {
      name,
      image: img.src,
      imageStatus: "ok"
    };
  }).filter(Boolean);

  return results;
}
