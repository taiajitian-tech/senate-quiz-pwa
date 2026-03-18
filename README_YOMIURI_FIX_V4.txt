このZIPの変更対象は2ファイルのみです。

上書き先
- senate-quiz-pwa/.github/workflows/update-representatives.yml
- senate-quiz-pwa/web/scripts/autoImageFetch.mjs

今回の修正
- 読売一覧の実HTML構造 `li.result.result__tosen` に合わせて抽出
- 個別ページの実HTML構造 `.election-shugiin-profile__photo img` / `.election-shugiin-profile__name` に合わせて抽出
- 相対URL結合を強化
- `src` / `data-src` / `srcset` / `data-srcset` / `data-lazy-srcset` 対応
- `rb` が無い場合でも `h1` から名前取得
- 一覧プロフィールから得た個別URLを必ず候補URLにも投入
- 一覧ページごとの `list-profiles=` ログ追加
- browser依存を停止
