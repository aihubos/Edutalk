import Image from "next/image";
import Link from "next/link";
import styles from "./brand.module.css";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={styles.brand} href="/" aria-label="EDU톡 홈">
      <Image className={styles.symbol} src="/icons/icon-192.png" alt="" width={compact ? 28 : 34} height={compact ? 28 : 34} priority />
      <span className={compact ? styles.compactWord : styles.word}>EDU톡</span>
    </Link>
  );
}
