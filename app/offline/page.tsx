"use client";

import Link from "next/link";
import { RefreshCcw, WifiOff } from "lucide-react";
import styles from "@/app/recovery.module.css";

export default function OfflinePage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="offline-title">
        <span className={styles.icon}><WifiOff size={24} aria-hidden="true" /></span>
        <h1 id="offline-title">인터넷 연결을 확인해 주세요</h1>
        <p>이미 열어 본 공개 화면은 일부 볼 수 있지만, 로그인·저장·후기·메시지·결제 기능은 연결이 필요해요.</p>
        <div className={styles.notice}>연결되지 않은 동안 입력한 내용은 서버에 저장되지 않습니다. 인터넷이 돌아온 뒤 제출 버튼을 다시 눌러 주세요.</div>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => window.location.reload()}>
            <RefreshCcw size={18} aria-hidden="true" />다시 연결하기
          </button>
          <Link className={styles.secondary} href="/">저장된 홈 보기</Link>
        </div>
      </section>
    </main>
  );
}
