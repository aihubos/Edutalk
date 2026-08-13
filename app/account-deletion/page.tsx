"use client";

import Link from "next/link";
import { CircleAlert, LogIn, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { getAccountDeletionRequest, requestAccountDeletion, type AccountDeletionRequest } from "@/lib/account-operations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { trackProductEvent } from "@/lib/product-events";
import styles from "./account-deletion.module.css";

type RequestSource = "server" | "local-demo";

export default function AccountDeletionPage() {
  const { accountAuthStatus } = useApp();
  const accountConfigured = isSupabaseConfigured();
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [source, setSource] = useState<RequestSource>("local-demo");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountConfigured) {
      const frame = window.requestAnimationFrame(() => {
        setRequest(getAccountDeletionRequest());
        setSource("local-demo");
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (accountAuthStatus !== "authenticated") return;
    let active = true;
    void fetch("/api/account-deletion").then(async (response) => {
      const payload = await response.json() as { request?: AccountDeletionRequest | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "탈퇴 요청 상태를 불러오지 못했어요.");
      if (!active) return;
      setRequest(payload.request ?? null);
      setSource("server");
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "탈퇴 요청 상태를 불러오지 못했어요.");
    });
    return () => { active = false; };
  }, [accountAuthStatus, accountConfigured]);

  const submit = async () => {
    if (!confirmed || request || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!accountConfigured) {
        setRequest(requestAccountDeletion());
        setSource("local-demo");
        return;
      }
      const response = await fetch("/api/account-deletion", { method: "POST" });
      const payload = await response.json() as { request?: AccountDeletionRequest; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error ?? "탈퇴 요청을 접수하지 못했어요.");
      setRequest(payload.request);
      setSource("server");
      trackProductEvent({ eventName: "ACCOUNT_DELETION_STARTED", path: "/account-deletion", category: "account" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "탈퇴 요청을 접수하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const waitingForAccount = accountConfigured && accountAuthStatus === "checking";
  const anonymous = accountConfigured && accountAuthStatus === "anonymous";

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>계정 관리</p>
        <h1>계정 삭제 요청</h1>
        <span>요청을 접수하면 운영자 확인 절차가 시작됩니다. 요청 즉시 계정이 삭제되지는 않습니다.</span>
      </header>

      <section className={styles.section} aria-labelledby="deletion-scope-title">
        <div className={styles.sectionHeading}>
          <CircleAlert aria-hidden="true" />
          <div><p>삭제 범위와 보존 예외</p><h2 id="deletion-scope-title">요청 전 확인해 주세요</h2></div>
        </div>
        <ul className={styles.scopeList}>
          <li>운영자 확인 뒤 계정, 개인 AI 초안, 대화, 비공개 증빙과 계정 소유 데이터가 삭제 대상이 됩니다.</li>
          <li>학생 성적처럼 다른 연결 사용자가 함께 보는 기록은 작성자 식별자만 제거될 수 있습니다.</li>
          <li>법령상 보존 의무나 분쟁 대응에 필요한 정보는 별도 기준에 따라 일정 기간 보관될 수 있습니다.</li>
        </ul>
        <p className={styles.caption}>정식 운영 전 검토용 안내입니다. 실제 처리 기준과 완료 안내 절차는 서비스 출시 전 확정됩니다.</p>
      </section>

      {waitingForAccount ? <section className={styles.stateCard} aria-busy="true">계정 연결 상태를 확인하고 있어요.</section> : null}
      {anonymous ? (
        <section className={styles.stateCard}>
          <LogIn aria-hidden="true" />
          <div><h2>로그인이 필요해요</h2><p>계정 탈퇴 요청 상태를 확인하거나 접수하려면 먼저 로그인해 주세요.</p></div>
          <Link href="/login">로그인하기</Link>
        </section>
      ) : null}

      {!waitingForAccount && !anonymous ? (
        <section className={styles.requestCard} aria-labelledby="deletion-request-title">
          <div className={styles.sectionHeading}>
            <Trash2 aria-hidden="true" />
            <div><p>{accountConfigured ? "계정 요청" : "브라우저 체험"}</p><h2 id="deletion-request-title">탈퇴 요청 접수</h2></div>
          </div>
          {!accountConfigured ? <p className={styles.demoNotice}>현재는 서버 연결 전 체험 모드입니다. 아래 접수는 이 브라우저에만 저장되며 실제 계정 삭제나 운영자 처리로 이어지지 않습니다.</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {request ? (
            <><p className={styles.pending} role="status"><strong>탈퇴 요청 접수됨</strong><span>{request.requestedAt.slice(0, 16).replace("T", " ")} · {source === "server" ? "계정 요청 저장됨 · 운영자 확인 대기" : "브라우저 체험 요청 · 실제 계정 삭제 없음"}</span></p><p className={styles.statusHelper}>{source === "server" ? <>다음 확인 목표: 접수 후 3영업일 안에 상태를 다시 안내합니다. 운영 목표이며 영업일 기준이고, 실제 일정은 달라질 수 있습니다. 이의가 있거나 요청을 바꾸려면 <Link href="/support">고객센터</Link>에 문의해 주세요.</> : "체험 요청은 운영자에게 전송되지 않아 다음 확인 일정과 이의제기 절차가 적용되지 않습니다."}</p></>
          ) : (
            <div className={styles.form}>
              <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>삭제 범위와 보존 예외를 확인했고, {accountConfigured ? "계정의 탈퇴 요청을 저장" : "브라우저 체험용 탈퇴 요청을 접수"}하는 데 동의합니다.</span></label>
              <button type="button" onClick={() => void submit()} disabled={!confirmed || busy}>{busy ? "접수 중" : "탈퇴 요청 접수"}</button>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
