
import { useState } from "react";

type Props = {
  updates: any;
  appMode?: any;
  onChangeAppMode?: any;
  target?: any;
  onChangeTarget?: any;
  onOpenUpdates?: () => void;
};

const STORAGE_KEY = "updates_last_seen";

export default function TitleView(props: Props) {
  const { updates } = props;

  const latest = updates?.generatedAt || "";

  const [lastSeen, setLastSeen] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_KEY) || "";
  });

  const hasUnread = lastSeen !== latest;

  const openNotice = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, latest);
    }
    setLastSeen(latest);

    if (props.onOpenUpdates) {
      props.onOpenUpdates();
    }
  };

  return (
    <div>
      <button onClick={openNotice} style={{ position: "relative" }}>
        🔔
        {hasUnread && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 10,
              height: 10,
              background: "red",
              borderRadius: "50%",
            }}
          />
        )}
      </button>
    </div>
  );
}
