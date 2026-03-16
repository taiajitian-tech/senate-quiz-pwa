# 引継ぎ要件（衆議院画像修正版）

## 今回入れた修正
- 画像未設定・誤画像対象を `web/public/assets/no-photo.webp` に統一
- `web/public/data/representatives.json` を更新
- `web/scripts/updateRepresentativesImages.js` を追加
- `web/package.json` の `gen:representatives:images` を新スクリプトへ変更
- `web/src/components/Learn.tsx` の学習画面画像サイズを 240px に調整
- `web/src/components/Quiz.tsx` の出題画面画像サイズを拡大
- `.github/workflows/update-representatives.yml` は手動実行のまま維持

## ZIPに含めていないもの
- `.git`
- `node_modules`
- `web/dist`
- 文字化けファイル
- 二重の `.github/.github`

## 注意
- 画像の新規実取得まではこの環境では未実施
- 空欄や誤画像は `assets/no-photo.webp` で確実に統一
- GitHub Actions は利用者の明示指示がある時だけ実行
