import Link from "next/link";
import styles from "../legal.module.css";

const sections = [
  ["1. 문서의 성격", ["이 문서는 후기·질문·신고 운영을 위한 출시 전 검토 초안입니다. 실제 제재와 이의제기 절차는 운영 정책과 담당자가 확정된 뒤 적용합니다."]],
  ["2. 작성 기준", ["후기와 메시지에는 실제 경험에 근거한 내용만 작성하고, 아동·학생·교직원·튜터의 실명, 연락처, 민감정보를 공개하지 않습니다.", "모욕, 차별, 협박, 허위사실, 광고·도배, 저작권 침해, 특정인 식별 위험이 있는 내용은 허용하지 않습니다."]],
  ["3. 교육자 일터 후기", ["교육자 일터 후기는 공개 작성자 정보를 익명으로 처리하고, 실제 관계 확인과 최소 후기 수 기준이 확정된 뒤 공개 점수에 반영합니다.", "학생·학부모·교육자 점수는 서로 섞지 않으며 광고 대가로 순위를 바꾸지 않습니다."]],
  ["4. 튜터와 증빙", ["튜터의 신원·자격 증빙은 공개 게시물이 아니라 비공개 심사 자료로 다룹니다. 비공개 Storage 업로드와 운영자 심사 코드는 준비되어 있으나, 실제 Supabase 프로젝트·Storage 정책·운영자 배정 전에는 실제 심사·보관을 시작하지 않습니다."]],
  ["5. 신고와 이의제기", ["신고 접수·본인 상태 조회와 운영자의 임시숨김·복원·기관 공식 답변 처리 코드는 준비되어 있습니다. 실제 프로젝트와 운영 역할이 적용되기 전에는 처리 결과·삭제·복원·답변을 실제 운영 조치로 보장하지 않습니다.", "신고와 이의제기 문의는 /support에서 안내합니다. 정식 서비스 전에는 처리 기한과 결과 통지 기준을 확정해 공개합니다."]],
] as const;

export default function CommunityPage() { return <main className={styles.page}><header className={styles.header}><span>법률 문서 초안</span><h1>커뮤니티 정책</h1><p>후기와 소통 기능의 작성 기준 및 운영 경계를 설명합니다.</p></header><p className={styles.notice}>출시 전 검토 초안입니다. 실제 운영 정책 또는 법률 검토 완료를 뜻하지 않습니다.</p><div className={styles.content}>{sections.map(([title, items]) => <section className={styles.section} key={title}><h2>{title}</h2><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}<nav className={styles.links} aria-label="법률 문서"><Link href="/legal/terms">이용약관 초안</Link><Link href="/legal/privacy">개인정보 처리방침 초안</Link><Link href="/support">고객센터</Link><Link href="/">홈으로 이동</Link></nav></div></main>; }
