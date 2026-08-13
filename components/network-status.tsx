"use client";

import { useEffect, useState } from "react";
import { WifiOff, X } from "lucide-react";
import styles from "./network-status.module.css";

export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const update = () => {
      setOnline(window.navigator.onLine);
      if (window.navigator.onLine) setDismissed(false);
    };

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online || dismissed) return null;

  return (
    <div className={styles.banner} role="status">
      <WifiOff size={18} aria-hidden="true" />
      <span>인터넷 연결이 끊겼어요. 저장과 제출은 연결이 돌아온 뒤 다시 시도해 주세요.</span>
      <button type="button" onClick={() => setDismissed(true)} aria-label="오프라인 안내 닫기">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
