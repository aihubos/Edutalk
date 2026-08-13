"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AtSign, CheckCircle2, Chrome, Info, KeyRound, LockKeyhole } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { trackProductEvent } from "@/lib/product-events";
import styles from "./auth-entry-panel.module.css";

const callbackPath = "/auth/callback?next=/onboarding";

export function AuthEntryPanel() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const signInWithProvider = async (provider: "google" | "kakao") => {
    setBusy(true);
    setStatus("");
    const supabase = await createBrowserSupabaseClient();
    if (!supabase) {
      setBusy(false);
      setStatus("로그인 연결이 아직 준비되지 않았어요. 체험 모드로 시작할 수 있어요.");
      return;
    }
    const client = supabase as { auth: { signInWithOAuth: (options: { provider: "google" | "kakao"; options: { redirectTo: string } }) => Promise<{ error: { message: string } | null }> } };
    trackProductEvent({ eventName: "LOGIN_STARTED", path: "/login", category: provider });
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: new URL(callbackPath, window.location.origin).toString() } });
    if (error) setStatus("로그인 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    setBusy(false);
  };

  const signInWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const supabase = await createBrowserSupabaseClient();
    if (!supabase) {
      setBusy(false);
      setStatus("이메일 로그인 연결이 아직 준비되지 않았어요. 체험 모드로 시작할 수 있어요.");
      return;
    }
    const client = supabase as { auth: { signInWithOtp: (options: { email: string; options: { emailRedirectTo: string } }) => Promise<{ error: { message: string } | null }> } };
    trackProductEvent({ eventName: "LOGIN_STARTED", path: "/login", category: "email" });
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL(callbackPath, window.location.origin).toString() } });
    setBusy(false);
    setStatus(error ? "로그인 링크를 보내지 못했어요. 이메일 주소를 확인하고 다시 시도해 주세요." : "로그인 링크를 보냈어요. 이메일에서 링크를 열어 역할 설정을 이어가세요.");
  };

  if (!configured) return <section className={styles.panel}>
    <div className={styles.notice}><Info size={19} aria-hidden /><p><strong>서버 연결 전 체험 모드예요.</strong> 계정 없이 화면과 역할 설정을 먼저 살펴볼 수 있어요.</p></div>
    <Link className={styles.primaryAction} href="/onboarding"><CheckCircle2 size={19} aria-hidden /> 계정 없이 체험 시작</Link>
    <p className={styles.helper}>Supabase 연결과 로그인 공급자 설정이 끝나면 이곳에서 실제 계정을 연결합니다.</p>
  </section>;

  return <section className={styles.panel}>
    <div className={styles.providerGroup} aria-label="소셜 로그인">
      <button type="button" onClick={() => signInWithProvider("google")} disabled={busy}><Chrome size={19} aria-hidden /> Google로 계속하기</button>
      <button type="button" onClick={() => signInWithProvider("kakao")} disabled={busy}><KeyRound size={19} aria-hidden /> Kakao로 계속하기</button>
    </div>
    <div className={styles.divider}><span>또는</span></div>
    <form className={styles.emailForm} onSubmit={signInWithEmail}>
      <label htmlFor="login-email">이메일</label>
      <div><AtSign size={18} aria-hidden /><input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></div>
      <button type="submit" disabled={busy}>이메일 로그인 링크 받기</button>
    </form>
    <aside className={styles.naver}><LockKeyhole size={18} aria-hidden /><p><strong>네이버 로그인은 준비 중이에요.</strong> 별도 OIDC 연결이 완료되면 제공됩니다.</p></aside>
    {status ? <p className={styles.status} role="status">{status}</p> : null}
    <p className={styles.helper}>로그인 후에는 역할 설정으로 이동합니다. 로그인 연결은 설정된 Supabase 환경에서만 작동합니다.</p>
  </section>;
}
