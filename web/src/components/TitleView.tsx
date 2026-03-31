
import { useState } from "react";

const STORAGE_KEY = "updates_last_seen";

export default function TitleView({ updates }) {
  const latest = updates?.generatedAt || "";
  const [lastSeen, setLastSeen] = useState(
    typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY) || ""
      : ""
  );

  const hasUnread = lastSeen !== latest;

  const openNotice = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, latest);
    }
    setLastSeen(latest);
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
