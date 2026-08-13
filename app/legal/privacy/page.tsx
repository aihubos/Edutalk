import Link from "next/link";
import styles from "../legal.module.css";

const sections = [
  ["1. 문서의 성격", ["이 문서는 출시 전 검토용 개인정보 처리방침 초안입니다. 실제 처리방침, 보관 기간, 처리 주체는 법률 검토와 서비스 개시 전에 확정합니다."]],
  ["2. 처리 예정 정보", ["계정·역할·연령대·지역·최소 프로필, 학생 별칭·학습 기록, 후기·신고·정정 요청, 교사-학부모 메시지의 최소 정보를 기능 제공 목적으로 처리할 수 있습니다.", "실명, 주민등록번호, 정확한 주소, 자녀의 불필요한 민감정보는 입력하거나 수집하지 않는 방향을 유지합니다."]],
  ["3. 미성년자와 보호자", ["만 14세 미만은 보호자 아래 자녀 프로필로 처리하며, 실제 서비스 전에는 법정대리인 동의와 확인 절차를 확정합니다."]],
  ["4. 저장·공유", ["학생 기록과 메시지는 연결된 본인·보호자·담당 교사 범위에서만 접근하도록 설계합니다.", "증빙 문서, 후기 사진, 메시지 이미지는 비공개 Storage와 접근·삭제 정책을 사용하는 코드가 준비되어 있습니다. 실제 Supabase 프로젝트·Storage 버킷·정책이 적용되기 전에는 실제 업로드·보관이 시작되지 않습니다."]],
  ["5. AI와 외부 서비스", ["AI 초안은 교사 확인 전 공유하지 않으며, API 호출은 입력된 사실을 초안화하는 용도로 제한합니다.", "공공데이터, 지도, 외부 후기 링크, OAuth, 결제사는 실제 계약·설정·검증 뒤에만 연결합니다."]],
  ["6. 삭제·보존·권리", ["계정 탈퇴 요청 저장과 ADMIN의 삭제·관련 데이터 정리 코드는 준비되어 있습니다. 실제 본인 확인, 서버 전용 키, 보관 정책, 운영자 배정이 적용되기 전에는 실제 삭제 완료·보존·완료 통지를 운영하지 않습니다.", "열람·정정·삭제·처리 정지·이의제기 문의는 /support에서 안내합니다. 실제 처리 기준과 기한은 정식 서비스 전 확정합니다."]],
] as const;

export default function PrivacyPage() { return <main className={styles.page}><header className={styles.header}><span>법률 문서 초안</span><h1>개인정보 처리방침</h1><p>현재 제품이 다루는 정보와 출시 전 미완료 경계를 설명합니다.</p></header><p className={styles.notice}>출시 전 검토 초안입니다. 실제 개인정보 처리방침이나 법률 검토 완료를 뜻하지 않습니다.</p><div className={styles.content}>{sections.map(([title, items]) => <section className={styles.section} key={title}><h2>{title}</h2><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}<nav className={styles.links} aria-label="법률 문서"><Link href="/legal/terms">이용약관 초안</Link><Link href="/legal/community">커뮤니티 정책 초안</Link><Link href="/support">고객센터</Link><Link href="/">홈으로 이동</Link></nav></div></main>; }
