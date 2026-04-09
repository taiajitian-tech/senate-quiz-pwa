// 修正ポイントのみ（既存構造はそのまま維持）

// 上段表示例（差し替え）
<p>
  <strong>{person.name}</strong>{" "}
  <strong style={{ fontSize: "0.8em" }}>{person.kana}</strong>
</p>

// 下段表示（役職のみ）
<p>{person.role}</p>
