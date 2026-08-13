import { ShieldAlert } from "lucide-react";
import type { CanonicalInstitutionHandlingEvent } from "@/lib/canonical-institutions";
import styles from "./institution-public-handling-timeline.module.css";

const correctionLabels = { APPROVED: "정보 정정이 승인되었습니다.", REJECTED: "정보 정정은 반영되지 않았습니다.", CANCELLED: "정보 정정 요청이 종료되었습니다." } as const;
const reportLabels = { TEMPORARILY_HIDDEN: "기관 대상 콘텐츠가 임시 비공개 처리되었습니다.", UPHELD: "신고 조치가 확정되었습니다.", RESTORED: "임시 비공개 조치가 복원되었습니다.", CLOSED: "신고 검토가 종료되었습니다." } as const;

export function InstitutionPublicHandlingTimeline({ events }: { events: CanonicalInstitutionHandlingEvent[] }) {
  return <section className={styles.section} aria-labelledby="handling-timeline-title">
    <div className={styles.header}><ShieldAlert size={18} aria-hidden="true" /><div><h2 id="handling-timeline-title">정정·신고 공개 처리 결과</h2><p>대기 요청, 신청자·작성자 정보, 증빙과 원문은 공개하지 않습니다.</p></div></div>
    {events.length ? <ol className={styles.list}>{events.map((event, index) => <li key={`${event.kind}-${event.outcome}-${event.handledAt}-${index}`}><time dateTime={event.handledAt}>{event.handledAt.slice(0, 10)}</time><div><strong>{event.kind === "CORRECTION" ? "기관 정보 정정" : "기관 대상 신고"}</strong><p>{label(event)}</p></div></li>)}</ol> : <p className={styles.empty}>공개할 최종 또는 임시 처리 결과가 없어요.</p>}
  </section>;
}

function label(event: CanonicalInstitutionHandlingEvent) {
  if (event.kind === "CORRECTION") return correctionLabels[event.outcome as keyof typeof correctionLabels] ?? "정정 요청 처리 결과가 공개되었습니다.";
  return reportLabels[event.outcome as keyof typeof reportLabels] ?? "신고 처리 결과가 공개되었습니다.";
}
