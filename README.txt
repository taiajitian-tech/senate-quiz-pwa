差し替え対象
web/src/components/TitleView.tsx
web/scripts/buildImagePool.mjs

修正内容
- 「最初に」だけ色変更（黄色系）
- 「学習」はそのまま主ボタン
- 「最初に」と「学習」を最上段の「まず使う場所」に整理
- 「おすすめの順番」をオプションの後ろ、メニューの下へ移動
- buildImagePool.mjs を同梱

実行
senate-quiz-pwa/web にいる状態で:
node scripts/buildImagePool.mjs
