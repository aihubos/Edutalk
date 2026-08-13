"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import styles from "./canonical-institution-actions.module.css";
import { trackProductEvent } from "@/lib/product-events";

type OfficialReply = { body: string; published_at: string; revision_count: number; last_revised_at: string | null };

export function CanonicalInstitutionActions({ institutionId }: { institutionId: string }) {
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<OfficialReply[]>([]);

  useEffect(() => {
    trackProductEvent({ eventName: "INSTITUTION_VIEWED", path: "/institutions/[id]", category: "canonical" });
    void fetch(`/api/institutions/${institutionId}/membership`).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { status?: string };
      setStatus(payload.status ?? "");
    });
    void fetch(`/api/institutions/${institutionId}/official-replies`).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { replies?: OfficialReply[] };
      setReplies(payload.replies ?? []);
    });
  }, [institutionId]);

  const request = async () => {
    const response = await fetch(`/api/institutions/${institutionId}/membership`, { method: "POST" });
    const payload = await response.json() as { status?: string; error?: string };
    if (!response.ok) { setMessage(payload.error ?? "로그인 후 신청할 수 있어요."); return; }
    setStatus(payload.status ?? "PENDING");
    setMessage("기관 관계 신청이 접수됐어요.");
  };

  return <>
    <section className={styles.panel}>
      <Building2 aria-hidden />
      <div><strong>기관 관계자이신가요?</strong><p>{status === "APPROVED" ? "기관 관계가 승인되어 기관 관리 화면을 사용할 수 있어요." : status === "CONFLICT_REVIEW" ? "이해관계가 겹칠 수 있어 운영자 별도 검토 중이에요. 후기 작성자 정보는 기관에 공개되지 않습니다." : status === "PENDING" ? "기관 관계 승인 대기 중이에요." : "공개 기관의 관계자로 신청할 수 있어요."}</p>{message ? <small>{message}</small> : null}</div>
      {!status ? <button type="button" onClick={() => void request()}>관계자 신청</button> : null}
    </section>
    {replies.length ? <section className={styles.replies} aria-label="기관 공식 답변"><h2>기관 공식 답변</h2>{replies.map((reply) => <article key={`${reply.published_at}-${reply.body}`}><p>{reply.body}</p><div className={styles.replyMeta}><time dateTime={reply.published_at}>답변 {formatDate(reply.published_at)}</time>{reply.revision_count > 0 ? <span>수정 {reply.revision_count}회 · 최근 수정 {formatDate(reply.last_revised_at)}</span> : <span>수정 이력 없음</span>}</div></article>)}</section> : null}
  </>;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "확인 중";
}
