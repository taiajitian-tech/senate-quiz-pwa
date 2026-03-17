# 衆議院画像取得の参照先修正

今回の修正では、衆議院の画像取得で参照優先順を見直した。

## 直接参照ページ
- 自由民主党・無所属の会
  - https://www.yomiuri.co.jp/election/shugiin/2026winners001/
- 中道改革連合・無所属
  - https://craj.jp/members/
- 国民民主党・無所属クラブ
  - https://www.yomiuri.co.jp/election/shugiin/2026winners013/
- 参政党
  - https://www.yomiuri.co.jp/election/shugiin/2026winners858/
- チームみらい
  - https://www.yomiuri.co.jp/election/shugiin/2026winners033/

## 実装方針
- `autoImageFetch.mjs` で会派ベースに参照先を変更
- 読売当選者ページ/CRAJ一覧を先に見て、名前一致ブロック内の画像を優先取得
- 直接URLが未指定の会派は、`site:yomiuri.co.jp/election/shugiin` 検索を先に使う
- その後に各会派公式を補完で使う
