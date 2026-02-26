import { useEffect, useMemo, useState } from "react";

type Senator = {
  id: number;
  name: string;
  images: string[];
};

export default function Quiz() {
  const [senators, setSenators] = useState<Senator[]>([]);
  const [idx, setIdx] = useState(0);
  const [imgTry, setImgTry] = useState(0);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/senators.json")
      .then((res) => res.json())
      .then((data: Senator[]) => setSenators(data));
  }, []);

  const current = senators[idx];

  // 画像は毎回ランダム（同一議員でも2〜3枚の候補から変わる）
  const imageUrl = useMemo(() => {
    if (!current?.images?.length) return "";
    const pick = Math.floor(Math.random() * current.images.length);
    return current.images[pick];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, current?.id]);

  if (!current) return <div>loading...</div>;

  return (
    <div style={{ textAlign: "center" }}>
      <h2>この議員は誰？</h2>

      <img
        src={current.images?.[imgTry] ?? imageUrl}
        alt={current.name}
        style={{
          width: "240px",
          height: "240px",
          objectFit: "cover",
          borderRadius: "12px",
          marginTop: "20px",
        }}
        onError={() => {
          // 画像が死んでたら次のURLへ（最大3回）
          setImgTry((v) => Math.min(v + 1, (current.images?.length ?? 1) - 1));
        }}
      />

      <div style={{ marginTop: "20px" }}>
        <button
          style={{
            padding: "12px 20px",
            borderRadius: "12px",
            border: "1px solid #ddd",
            cursor: "pointer",
            fontSize: "16px",
            background: "white",
          }}
          onClick={() => {
            alert(current.name);
          }}
        >
          {current.name}
        </button>
      </div>

      <div style={{ marginTop: "16px" }}>
        <button
          style={{
            padding: "10px 16px",
            borderRadius: "12px",
            border: "1px solid #ddd",
            cursor: "pointer",
            fontSize: "14px",
            background: "white",
          }}
          onClick={() => {
            setImgTry(0);
            setIdx((v) => (senators.length ? (v + 1) % senators.length : 0));
          }}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
