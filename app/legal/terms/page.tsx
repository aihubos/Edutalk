import Link from "next/link";
import styles from "../legal.module.css";

const sections = [
  ["1. 문서의 성격", ["이 문서는 EDU톡 출시 전 검토를 위한 이용약관 초안입니다. 법률 검토, 운영 주체 확정, 실제 서비스 개시 전에는 변경될 수 있습니다.", "현재 앱의 demo 화면과 계정 모드 기반은 정식 서비스 개시를 의미하지 않습니다."]],
  ["2. 서비스 범위", ["EDU톡은 교육기관·튜터 정보 탐색, 역할별 후기, 학생 성장 기록, 교사-학부모 소통을 위한 화면과 연결 기반을 제공합니다.", "기관 정보, 순위, 후기, 외부 링크는 실제 데이터와 운영 검증이 완료된 뒤에만 상용 서비스 정보로 제공됩니다."]],
  ["3. 계정과 역할", ["계정 모드에서는 로그인 후 연령, 약관 확인, 대표 역할, 지역, 최소 프로필을 설정합니다.", "만 14세 미만 사용자는 보호자 아래 자녀 프로필로 이용하며 독립 학생 역할은 제한됩니다."]],
  ["4. 후기·증빙·신고", ["후기와 인증 요청은 실제 이용 또는 근무 관계 확인, 익명 공개 기준, 신고·임시조치 정책이 확정된 뒤 운영합니다.", "튜터 신원·자격 증빙 원본은 공개하지 않으며, 비공개 Storage와 심사 절차가 연결되기 전에는 실제 제출을 받지 않습니다."]],
  ["5. AI 초안과 결제", ["AI 학생일지와 생기부는 교사가 확인해야 하는 초안이며, 사실 확인과 최종 책임은 이용자에게 있습니다.", "현재 결제사와 구독 권한은 연결되지 않았습니다. 화면의 유료 무제한 안내는 결제 또는 청구를 발생시키지 않습니다."]],
  ["6. 변경·문의", ["지원센터는 /support에서 공개합니다. 정식 서비스 전에는 약관 변경 고지, 이의제기 접수와 처리 기준을 추가로 확정해야 합니다.", "지원센터의 접수 안내는 출시 전 운영 준비용이며, 실제 처리 기한과 담당 절차는 아직 확정되지 않았습니다."]],
] as const;

export default function TermsPage() {
  return <main className={styles.page}><header className={styles.header}><span>법률 문서 초안</span><h1>이용약관</h1><p>EDU톡 서비스 이용 범위와 기본 운영 원칙을 설명합니다.</p></header><p className={styles.notice}>출시 전 검토 초안입니다. 법률 검토 완료 또는 실제 효력을 뜻하지 않습니다.</p><div className={styles.content}>{sections.map(([title, items]) => <section className={styles.section} key={title}><h2>{title}</h2><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}<LegalLinks /></div></main>;
}

function LegalLinks() { return <nav className={styles.links} aria-label="법률 문서"><Link href="/legal/privacy">개인정보 처리방침 초안</Link><Link href="/legal/community">커뮤니티 정책 초안</Link><Link href="/support">고객센터</Link><Link href="/">홈으로 이동</Link></nav>; }
