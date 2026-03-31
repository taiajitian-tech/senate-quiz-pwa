import { useEffect, useState } from "react";

const STORAGE_KEY = "updates_last_seen";

export default function Header({ updates }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const latestUpdate = updates?.updatedAt || "";

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    setHasUnread(lastSeen !== latestUpdate);
  }, [latestUpdate]);

  const handleOpenNotice = () => {
    localStorage.setItem(STORAGE_KEY, latestUpdate);
    setHasUnread(false);
    setIsOpen(true);
  };

  return (
    <div>
      <button onClick={handleOpenNotice} style={{ position: "relative" }}>
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

      {isOpen && (
        <div>
          <p>更新内容</p>
        </div>
      )}
    </div>
  );
}
