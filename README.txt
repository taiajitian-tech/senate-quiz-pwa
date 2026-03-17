# 修正内容

■目的
読売の候補者ページから「当選者のみ」画像取得

■変更点
- バラ画像（当選マーク）を基準に判定
- 同ページ内の他候補は除外
- browser方式は使用せずHTML解析

■配置
web/scripts/yomiuriWinnerFetch.mjs

■実行
node web/scripts/yomiuriWinnerFetch.mjs
