変更対象のみ同梱
- .github/workflows/update-representatives.yml
- web/scripts/fetchNhkWinnersImagesStatic.mjs

内容
- Puppeteer 不使用
- NHK入口HTMLから script/anchor を静的抽出
- window.App_SenkyoData を取得
- script 本文から json/js/html 候補URLを抽出
- JSON/JS/HTML を直取得して名前+画像を照合
- raw-cards=0 なら即失敗
