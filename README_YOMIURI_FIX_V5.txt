修正点
- autoImageFetch.mjs の normalizeUrl() を修正
- 旧実装は https:// を https:/ に壊していました
- そのため読売の完全URL・相対URLの両方で URL が破損し、候補URL抽出が 0 件化していました
- sample-candidate-url ログを追加
- workflow の browser フラグは false を維持
