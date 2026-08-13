"use client";

import { FormEvent, useEffect, useState } from "react";
import { CircleHelp, Mail, MessageSquareText } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supportCategoryLabels, supportStatusLabels, type SupportRequestInput, type SupportStatus } from "@/lib/support-server";
import styles from "./support.module.css";

type RequestItem = SupportRequestInput & { id: string; status: SupportStatus; createdAt: string; responseBody?: string; respondedAt?: string };
const storageKey = "edutalk-support-requests-v1";
const initialForm: SupportRequestInput = { category: "ACCOUNT", title: "", body: "", replyEmail: "" };

function SupportStatusHelper({ status, demo }: { status: SupportStatus; demo: boolean }) {
  if (demo) return <p className={styles.statusHelper}>체험 요청은 운영팀에 전송되지 않아 다음 확인 일정과 이의제기 절차가 적용되지 않습니다.</p>;
  if (status === "RECEIVED" || status === "IN_PROGRESS") return <p className={styles.statusHelper}>다음 확인 목표: 접수 후 3영업일 안에 상태를 다시 안내합니다. 운영 목표이며 영업일 기준이고, 실제 일정은 달라질 수 있습니다.</p>;
  if (status === "ANSWERED" || status === "CLOSED") return <p className={styles.statusHelper}>현재 요청은 답변 또는 종료 상태입니다. 추가 확인이 필요하면 고객센터에 이어서 문의해 주세요. 운영 목표이며 실제 일정은 달라질 수 있습니다.</p>;
  return null;
}

export default function SupportPage() {
  const configured = isSupabaseConfigured();
  const [form, setForm] = useState<SupportRequestInput>(initialForm);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (configured) {
      const response = await fetch("/api/support");
      const payload = await response.json() as { mode?: string; requests?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok || payload.mode !== "supabase") { setMessage(payload.error ?? "로그인 후 문의 내역을 확인할 수 있어요."); setLoaded(true); return; }
      setRequests((payload.requests ?? []).map((item) => ({ id: String(item.id), category: item.category as SupportRequestInput["category"], title: String(item.title), body: String(item.body), replyEmail: typeof item.reply_email === "string" ? item.reply_email : "", status: item.status as SupportStatus, createdAt: String(item.created_at), responseBody: typeof item.response_body === "string" ? item.response_body : undefined, respondedAt: typeof item.responded_at === "string" ? item.responded_at : undefined })));
    } else {
      try { const saved = window.localStorage.getItem(storageKey); if (saved) setRequests(JSON.parse(saved) as RequestItem[]); } catch { setMessage("이 브라우저의 문의 내역을 불러오지 못했어요."); }
    }
    setLoaded(true);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
    // `configured`가 바뀌면 계정 또는 체험 저장소를 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 1 || form.body.trim().length < 10) { setMessage("제목과 10자 이상의 문의 내용을 입력해 주세요."); return; }
    if (configured) {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) { setMessage(payload.error ?? "문의 접수에 실패했어요."); return; }
      await load();
      setMessage("문의가 계정에 접수됐어요. 답변과 상태는 이 화면에서 확인할 수 있으며, 이메일 발송은 아직 연결되지 않았습니다.");
    } else {
      const item: RequestItem = { ...form, id: `support-${Date.now()}`, status: "RECEIVED", createdAt: new Date().toISOString() };
      const next = [item, ...requests];
      setRequests(next);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setMessage("문의가 이 브라우저에 체험용으로 접수됐어요. 실제 운영팀에는 전송되지 않습니다.");
    }
    setForm(initialForm);
  };

  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.kicker}>고객센터</p><h1>도움이 필요한 내용을 남겨주세요</h1><p>{configured ? "계정에 문의를 저장하고 운영자 답변과 상태를 확인할 수 있어요." : "서버 연결 전 체험 모드입니다. 문의는 이 브라우저에만 저장됩니다."}</p></div><CircleHelp aria-hidden /></header>
    <aside className={styles.notice}><Mail size={18} aria-hidden /><p>{configured ? <><strong>답변은 이 화면에서 확인할 수 있어요.</strong> 이메일 발송 알림은 아직 연결되지 않았습니다.</> : <><strong>체험 문의는 브라우저에만 저장돼요.</strong> 실제 운영팀 전송과 이메일 발송은 연결되지 않았습니다.</>}</p></aside>
    <section className={styles.workspace}><form onSubmit={submit} className={styles.form}>
      <label>문의 유형<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SupportRequestInput["category"] })}>{Object.entries(supportCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>제목<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} required /></label>
      <label>문의 내용<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} minLength={10} maxLength={3000} rows={6} required /></label>
      <label>회신 받을 이메일 <small>선택</small><input type="email" value={form.replyEmail} onChange={(event) => setForm({ ...form, replyEmail: event.target.value })} maxLength={254} /></label>
      <button type="submit"><MessageSquareText size={18} aria-hidden /> 문의 접수</button>
    </form></section>
    <section className={styles.history} aria-labelledby="support-history-title"><div className={styles.historyHeader}><h2 id="support-history-title">내 문의 내역</h2><span>{requests.length}건</span></div>{!loaded ? <p className={styles.empty}>문의 내역을 불러오는 중이에요.</p> : requests.length === 0 ? <p className={styles.empty}>아직 접수한 문의가 없어요.</p> : <div className={styles.list}>{requests.map((item) => <article key={item.id}><div><span className={styles.status} data-status={item.status}>{supportStatusLabels[item.status]}</span><time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></div><strong>{item.title}</strong><p>{supportCategoryLabels[item.category]} · {item.body}</p><SupportStatusHelper status={item.status} demo={!configured} />{item.responseBody ? <div className={styles.response}><strong>운영자 답변</strong><p>{item.responseBody}</p>{item.respondedAt ? <time dateTime={item.respondedAt}>답변일 {item.respondedAt.slice(0, 10)}</time> : null}</div> : null}</article>)}</div>}</section>
    {message ? <p className={styles.message} role="status">{message}</p> : null}
  </main>;
}
