import { useState } from "react";

type Props = {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  fallbackStyle?: React.CSSProperties;
  fallbackText?: string;
  maskBottom?: boolean;
};

const wrapStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
  overflow: "hidden",
  lineHeight: 0,
};

const maskStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: "28%",
  pointerEvents: "none",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  backgroundImage:
    "linear-gradient(to top, rgba(255,255,255,0.92), rgba(255,255,255,0.68)), repeating-linear-gradient(0deg, rgba(210,210,210,0.55) 0 7px, rgba(245,245,245,0.55) 7px 14px), repeating-linear-gradient(90deg, rgba(220,220,220,0.5) 0 9px, rgba(245,245,245,0.5) 9px 18px)",
};

export default function SafeImage(props: Props) {
  const [broken, setBroken] = useState(false);

  if (!props.src || broken) {
    return <div style={props.fallbackStyle}>{props.fallbackText ?? "画像なし"}</div>;
  }

  if (!props.maskBottom) {
    return <img src={props.src} alt={props.alt} style={props.style} onError={() => setBroken(true)} />;
  }

  const mergedWrap: React.CSSProperties = {
    ...wrapStyle,
    width: typeof props.style?.width === "number" ? `${props.style.width}px` : props.style?.width,
    height: typeof props.style?.height === "number" ? `${props.style.height}px` : props.style?.height,
    borderRadius: props.style?.borderRadius,
    background: props.style?.background,
  };

  return (
    <div style={mergedWrap}>
      <img src={props.src} alt={props.alt} style={props.style} onError={() => setBroken(true)} />
      <div aria-hidden="true" style={maskStyle} />
    </div>
  );
}
