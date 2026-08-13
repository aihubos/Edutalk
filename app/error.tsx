"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import styles from "@/app/recovery.module.css";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="error-title">
        <span className={styles.icon}><AlertTriangle size={24} aria-hidden="true" /></span>
        <h1 id="error-title">화면을 불러오지 못했어요</h1>
        <p>입력한 개인정보나 문서 내용을 오류 메시지에 표시하지 않습니다. 잠시 뒤 다시 시도해 주세요.</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={reset}>
            <RefreshCcw size={18} aria-hidden="true" />다시 시도하기
          </button>
          <Link className={styles.secondary} href="/support">고객센터로 이동</Link>
        </div>
      </section>
    </main>
  );
}
