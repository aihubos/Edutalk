"use client";

import Link from "next/link";
import { Check, Clock3, Infinity as InfinityIcon, Sparkles } from "lucide-react";
import { getBillingStatusDisplay, type BillingSubscriptionStatus } from "@/lib/billing-data";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useEffect, useState } from "react";
import styles from "./subscription.module.css";

type ServerBillingStatus = {
  usage: { plan: "FREE" | "UNLIMITED"; freeLimit: number; usedCount: number; subscriptionActive: boolean; currentPeriodEnd: string | null } | null;
  subscription: { status: BillingSubscriptionStatus; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
};

export default function SubscriptionPage() {
  const { aiUsage, setSubscriptionPlan, accountAuthStatus } = useApp();
  const demoMode = process.env.NEXT_PUBLIC_DATA_MODE !== "production";
  const supabaseConfigured = isSupabaseConfigured();
  const serverConnected = supabaseConfigured && accountAuthStatus === "authenticated";
  const [serverBilling, setServerBilling] = useState<ServerBillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const usage = serverConnected && serverBilling?.usage
    ? { plan: serverBilling.usage.plan, freeLimit: serverBilling.usage.freeLimit, used: serverBilling.usage.usedCount, subscriptionActive: serverBilling.usage.subscriptionActive }
    : { plan: aiUsage.plan, freeLimit: aiUsage.freeLimit, used: aiUsage.used, subscriptionActive: aiUsage.subscriptionStatus === "ACTIVE" };
  const remaining = Math.max(0, usage.freeLimit - usage.used);
  const previewingUnlimited = usage.plan === "UNLIMITED" && (serverConnected ? usage.subscriptionActive : true);
  const serverStatus: BillingSubscriptionStatus | null = serverBilling?.subscription?.status ?? null;
  const serverStatusDisplay = serverStatus ? getBillingStatusDisplay(serverStatus) : null;
  const [billingBusy, setBillingBusy] = useState<"checkout" | "portal" | null>(null);
  const [billingError, setBillingError] = useState("");
  const [returnNotice, setReturnNotice] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const result = new URLSearchParams(window.location.search).get("billing");
      if (result === "success" || result === "return") setReturnNotice("결제사 화면에서 돌아왔어요. 구독 상태는 결제사 확인 뒤 계정 사용량에 반영됩니다.");
      if (result === "cancel") setReturnNotice("결제를 완료하지 않았어요. 현재 플랜은 바뀌지 않았습니다.");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!serverConnected) return;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        setStatusLoading(true);
        setStatusError("");
        try {
          const response = await fetch("/api/billing/status");
          const payload = await response.json().catch(() => ({})) as ServerBillingStatus & { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "계정 구독 상태를 불러오지 못했어요.");
          setServerBilling({ usage: payload.usage ?? null, subscription: payload.subscription ?? null });
        } catch (error) {
          setStatusError(error instanceof Error ? error.message : "계정 구독 상태를 불러오지 못했어요.");
        } finally {
          setStatusLoading(false);
        }
      })();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [serverConnected]);

  const openBilling = async (kind: "checkout" | "portal") => {
    if (!serverConnected) return;
    setBillingBusy(kind);
    setBillingError("");
    try {
      const response = await fetch(`/api/billing/${kind}`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "결제 연결을 아직 시작할 수 없어요.");
      window.location.assign(payload.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "결제 연결을 아직 시작할 수 없어요.");
      setBillingBusy(null);
    }
  };

  return (
    <div className="page-container">
      <header className={styles.header}>
        <span>AI 업무 도구</span>
        <h1>사용량과 플랜</h1>
        <p>학생일지와 생기부 초안은 계정당 같은 사용량을 공유해요.</p>
      </header>

      <section className={styles.usage} aria-label="현재 AI 사용량">
        <div className={styles.usageIcon}><Sparkles size={24} /></div>
        <div>
          <span>{serverConnected ? "계정 사용량" : "브라우저 체험 상태"}</span>
          <strong>{statusLoading && serverConnected ? "계정 사용량을 불러오는 중" : previewingUnlimited ? serverConnected ? "활성 무제한 플랜" : "무제한 화면 미리보기" : `무료 ${remaining}회 남음`}</strong>
        </div>
        <div className={styles.meter} aria-label={`무료 사용량 ${usage.used}/${usage.freeLimit}`}>
          <span style={{ width: `${Math.min(100, (usage.used / usage.freeLimit) * 100)}%` }} />
        </div>
      </section>

      <section className={styles.connectionStatus} aria-label="상용 결제 연결 상태">
        <Clock3 size={20} aria-hidden="true" />
        <div>
          <strong>{serverConnected ? "결제 연결을 시작할 수 있어요" : "계정·결제 연결 준비 중"}</strong>
          <p>{serverConnected ? "결제 시작과 구독 관리는 결제사 화면에서 진행됩니다. 완료 뒤에는 웹훅 확인 후 계정 권한이 반영됩니다." : supabaseConfigured ? "로그인한 계정에서만 결제 연결을 시작할 수 있어요." : "Supabase와 결제사가 아직 연결되지 않아, 이 화면에서 실제 결제나 구독은 발생하지 않습니다."}</p>
        </div>
      </section>

      {returnNotice ? <p className={styles.billingNotice} role="status">{returnNotice}</p> : null}
      {statusError ? <p className={styles.billingError} role="alert">{statusError}</p> : null}
      {billingError ? <p className={styles.billingError} role="alert">{billingError}{!demoMode ? " 결제 API와 결제사 환경 설정을 확인해 주세요." : ""}</p> : null}

      <div className={styles.plans}>
        <article className={!previewingUnlimited ? styles.planActive : styles.plan}>
          <div>
            <span>기본</span>
            <strong>무료</strong>
            <b>₩0</b>
          </div>
          <ul>
            <li><Check size={17} /> 계정당 AI 초안 총 10회</li>
            <li><Check size={17} /> 학생일지와 생기부 초안</li>
            <li><Check size={17} /> 초안 직접 수정과 저장</li>
          </ul>
          {!previewingUnlimited ? <button disabled>{serverConnected ? "현재 무료 플랜" : "현재 체험 플랜"}</button> : serverConnected ? <button disabled>현재 활성 플랜</button> : <button onClick={() => setSubscriptionPlan("FREE")}>무료 화면으로 돌아가기</button>}
        </article>

        <article className={previewingUnlimited ? styles.planActive : styles.plan}>
          <div>
            <span>업무용</span>
            <strong><InfinityIcon size={25} /> 유료 무제한</strong>
            <b>출시 후 가격 안내</b>
          </div>
          <ul>
            <li><Check size={17} /> 확인된 활성 구독 기간에 AI 무제한</li>
            <li><Check size={17} /> 담당 학생 전체의 초안 작성</li>
            <li><Check size={17} /> 결제사 웹훅 확인 뒤 권한 반영</li>
          </ul>
          {serverConnected ? <button onClick={() => void openBilling("checkout")} disabled={billingBusy !== null}>{billingBusy === "checkout" ? "결제 화면으로 이동 중…" : "유료 무제한 시작하기"}</button> : <button disabled>{demoMode ? "출시 알림 신청 준비 중" : "로그인과 결제 연결이 필요해요"}</button>}
          {demoMode && !serverConnected && (
            <button className={styles.previewButton} onClick={() => setSubscriptionPlan(previewingUnlimited ? "FREE" : "UNLIMITED")}>
              {previewingUnlimited ? "무료 화면 미리보기" : "무제한 화면 미리보기"}
            </button>
          )}
        </article>
      </div>

      <section className={styles.serverStatus}>
        <span>{serverConnected ? "서버 구독 상태" : "향후 서버 구독 상태"}</span>
        <p><b>활성</b> 상태는 무제한 사용, <b>결제 지연</b>과 <b>취소</b> 상태는 무료 한도를 적용합니다.</p>
        {serverStatusDisplay && <small>{serverStatusDisplay.label}: {serverStatusDisplay.description}</small>}
        {serverConnected && !statusLoading && !serverStatus ? <small>아직 결제사에서 확인된 구독 상태가 없어요.</small> : null}
        {serverBilling?.subscription?.currentPeriodEnd ? <small>현재 기간 종료: {new Date(serverBilling.subscription.currentPeriodEnd).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}{serverBilling.subscription.cancelAtPeriodEnd ? " · 기간 종료 후 해지 예정" : ""}</small> : null}
      </section>

      {serverConnected ? <section className={styles.manageSubscription} aria-label="구독 관리"><div><strong>이미 구독 중인가요?</strong><p>결제사 고객 포털에서 결제 수단과 구독 상태를 관리할 수 있어요.</p></div><button type="button" onClick={() => void openBilling("portal")} disabled={billingBusy !== null}>{billingBusy === "portal" ? "관리 화면으로 이동 중…" : "구독 관리"}</button></section> : null}

      <div className="demo-notice">
        {serverConnected
          ? "무료 사용량은 계정 기준입니다. 결제 완료 화면만으로 권한이 바뀌지 않으며, 결제사 웹훅 확인 뒤에만 유료 권한이 활성화됩니다."
          : "지금 표시되는 플랜과 사용량은 이 브라우저에만 저장되는 체험 상태입니다. 실제 구독, 결제, 청구 또는 권한 부여가 아닙니다."}
      </div>

      <div className={styles.links}>
        <Link href="/teacher-log">AI 학생일지로 돌아가기</Link>
        <Link href="/school-record">AI 생기부 초안으로 이동</Link>
      </div>
    </div>
  );
}
