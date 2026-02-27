import { useEffect, useState } from "react";

type Senator = {
  id: number;
  name: string;
  images?: string[];
};

function toImageSrc(url: string | undefined) {
  if (!url) return "";
  if (url.startsWith("http")) return url;

  // GitHub Pages base 対応
  return import.meta.env.BASE_URL + url.replace(/^\/+/, "");
}

export default function Quiz() {
  const [senators, setSenators] = useState<Senator[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/senators.json")
      .then((res) => res.json())
      .then((data) => setSenators(data))
      .catch((err) => console.error(err));
  }, []);

  if (!senators.length) return <div>loading...</div>;

  const current = senators[currentIndex];
  const imageSrc = toImageSrc(current.images?.[0]);

  return (
    <div style={{ textAlign: "center" }}>
      <h2>この議員は誰？</h2>

      {imageSrc ? (
        <img
          src={imageSrc}
          alt={current.name}
          style={{
            width: "200px",
            height: "200px",
            objectFit: "cover",
            borderRadius: "8px",
          }}
          onError={(e) => {
            console.error("Image failed:", imageSrc);
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}

      <div style={{ marginTop: "16px" }}>
        <button>{current.name}</button>
      </div>

      <div style={{ marginTop: "12px" }}>
        <button
          onClick={() =>
            setCurrentIndex((prev) =>
              prev + 1 < senators.length ? prev + 1 : 0
            )
          }
        >
          次へ
        </button>
      </div>
    </div>
  );
}
