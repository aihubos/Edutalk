import Link from "next/link";
import { SearchX } from "lucide-react";
import styles from "@/app/recovery.module.css";

export default function NotFoundPage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="not-found-title">
        <span className={styles.icon}><SearchX size={24} aria-hidden="true" /></span>
        <h1 id="not-found-title">요청한 화면을 찾을 수 없어요</h1>
        <p>주소가 바뀌었거나 공개가 중지된 정보일 수 있어요.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/">홈으로 이동</Link>
          <Link className={styles.secondary} href="/discover">기관 다시 찾기</Link>
        </div>
      </section>
    </main>
  );
}
