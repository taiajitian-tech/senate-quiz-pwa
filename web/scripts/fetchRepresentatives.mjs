import fs from "fs";
import cheerio from "cheerio";

const URL =
"https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

const PARTY_LIST = [
"自民",
"立民",
"維新",
"公明",
"共産",
"国民",
"れ新",
"参政",
"社民",
"無"
];

async function main() {

const res = await fetch(URL);
const buffer = await res.arrayBuffer();

const html = new TextDecoder("shift_jis").decode(buffer);

const $ = cheerio.load(html);

const result = [];

$("tr").each((i, tr) => {

const tds = $(tr).find("td");

if (tds.length < 3) return;

const name = $(tds[0]).text().trim();
const kana = $(tds[1]).text().trim();
const party = $(tds[2]).text().trim();

if (!name) return;
if (!kana) return;

let p = PARTY_LIST.find(v => party.includes(v));

if (!p) p = party;

const cleanedName =
name
.replace(/\s/g,"")
.replace(/君$/,"");

const cleanedKana =
kana
.replace(/\s/g,"");

result.push({
name: cleanedName,
kana: cleanedKana,
house: "衆議院",
party: p
});

});

console.log("representatives:", result.length);

if (result.length < 400) {
throw new Error("Too few representatives extracted");
}

fs.writeFileSync(
"web/public/data/representatives.json",
JSON.stringify(result,null,2)
);

}

main();