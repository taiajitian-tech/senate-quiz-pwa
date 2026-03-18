変更対象のみ同梱
- .github/workflows/update-representatives.yml
- web/scripts/fetchNhkStaticAssets.mjs

修正点
- Puppeteer不使用
- NHKのHTML / JSON / CSV / JS本文を横断して photo URL を探索
- screenshotで確認できた /senkyo-data/.../photo/*.jpg 直取りに対応
- hindex.csv / sindex.csv / stindex.csv なども探索対象に追加
- raw-cards=0 なら即失敗
