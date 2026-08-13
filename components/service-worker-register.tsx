"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 앱은 서비스 워커 등록 실패 시에도 온라인 모드로 동작한다.
      });
    }
  }, []);

  return null;
}
