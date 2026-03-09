import { useState } from "react";

type Props = {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  fallbackStyle?: React.CSSProperties;
  fallbackText?: string;
};

export default function SafeImage(props: Props) {
  const [broken, setBroken] = useState(false);

  if (!props.src || broken) {
    return <div style={props.fallbackStyle}>{props.fallbackText ?? "画像なし"}</div>;
  }

  return <img src={props.src} alt={props.alt} style={props.style} onError={() => setBroken(true)} />;
}
