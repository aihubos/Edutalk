"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, FilePlus2, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import styles from "./server-public-information-manager.module.css";

type Role = "PARENT" | "STUDENT" | "TEACHER";
type Category = "POLICY" | "EVENT" | "PROGRAM";
type Status = "OPEN" | "ONGOING" | "CLOSED";
type Item = { id: string; title: string; summary: string; audienceRoles: Role[]; category: Category; organizer: string; applicationPeriod: string; status: Status; region: string; sourceUrl: string; sourceLabel: string; sourceDate: string; isPublic: boolean; updatedAt: string | null };
type Form = Omit<Item, "id" | "updatedAt">;

const emptyForm: Form = { title: "", summary: "", audienceRoles: ["PARENT"], category: "POLICY", organizer: "", applicationPeriod: "", status: "OPEN", region: "", sourceUrl: "", sourceLabel: "", sourceDate: "", isPublic: false };
const roleLabels: Record<Role, string> = { PARENT: "학부모", STUDENT: "학생", TEACHER: "선생님" };
const categoryLabels: Record<Category, string> = { POLICY: "정책", EVENT: "행사", PROGRAM: "프로그램" };
const statusLabels: Record<Status, string> = { OPEN: "신청 가능", ONGOING: "진행 중", CLOSED: "마감" };

export function ServerPublicInformationManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/public-information");
      const payload = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "정책·행사 목록을 불러오지 못했어요.");
      setItems(payload.items ?? []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "정책·행사 목록을 불러오지 못했어요."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setField = <Key extends keyof Form>(key: Key, value: Form[Key]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleRole = (role: Role) => setForm((current) => ({ ...current, audienceRoles: current.audienceRoles.includes(role) ? current.audienceRoles.filter((item) => item !== role) : [...current.audienceRoles, role] }));
  const reset = () => { setEditingId(null); setForm(emptyForm); setMessage(""); };
  const edit = (item: Item) => { const { id, updatedAt, ...next } = item; void id; void updatedAt; setEditingId(item.id); setForm(next); setError(""); setMessage(""); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/public-information", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "정책·행사 항목을 저장하지 못했어요.");
      setMessage(editingId ? "정책·행사 항목을 수정했어요." : "정책·행사 항목을 등록했어요.");
      setEditingId(null); setForm(emptyForm); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "정책·행사 항목을 저장하지 못했어요."); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 항목을 삭제할까요? 공개 중인 항목도 즉시 목록에서 사라집니다.")) return;
    setDeletingId(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/public-information", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "정책·행사 항목을 삭제하지 못했어요.");
      if (editingId === id) reset();
      setMessage("정책·행사 항목을 삭제했어요."); await load();
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "정책·행사 항목을 삭제하지 못했어요."); }
    finally { setDeletingId(""); }
  };

  if (loading) return <section className={styles.panel} aria-busy="true"><Header title="정책·행사 목록을 불러오는 중이에요" /><p className={styles.empty}>운영자가 검수한 원문 연결 항목을 확인하고 있습니다.</p></section>;
  if (error && items.length === 0) return <section className={styles.panel} role="alert"><Header title="정책·행사 운영 권한을 확인할 수 없어요" /><p className={styles.error}>{error}</p><button className={styles.refresh} type="button" onClick={() => void load()}><RefreshCcw size={16} aria-hidden="true" />다시 시도</button></section>;

  return <section className={styles.panel} aria-labelledby="public-information-title">
    <Header title="공식 원문 기반 정책·행사 등록" />
    <p className={styles.helper}>외부 수집을 실행하지 않습니다. 운영자가 출처·기준일을 확인한 항목만 등록하고, 공개 여부를 직접 정합니다.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {message ? <p className={styles.message} role="status"><CheckCircle2 size={16} aria-hidden="true" />{message}</p> : null}
    <form className={styles.form} onSubmit={save}>
      <div className={styles.formHeader}><h3>{editingId ? "정책·행사 항목 수정" : "새 정책·행사 항목"}</h3>{editingId ? <button type="button" className={styles.textButton} onClick={reset}>수정 취소</button> : null}</div>
      <div className={styles.grid}>
        <label className={styles.wide}>제목<input value={form.title} onChange={(event) => setField("title", event.target.value)} maxLength={200} required disabled={saving} /></label>
        <label className={styles.wide}>요약<textarea value={form.summary} onChange={(event) => setField("summary", event.target.value)} maxLength={3000} required rows={4} disabled={saving} /></label>
        <fieldset className={styles.wide}><legend>대상 역할</legend><div className={styles.roleList}>{(Object.keys(roleLabels) as Role[]).map((role) => <label key={role}><input type="checkbox" checked={form.audienceRoles.includes(role)} onChange={() => toggleRole(role)} disabled={saving} />{roleLabels[role]}</label>)}</div></fieldset>
        <label>유형<select value={form.category} onChange={(event) => setField("category", event.target.value as Category)} disabled={saving}>{(Object.keys(categoryLabels) as Category[]).map((category) => <option value={category} key={category}>{categoryLabels[category]}</option>)}</select></label>
        <label>상태<select value={form.status} onChange={(event) => setField("status", event.target.value as Status)} disabled={saving}>{(Object.keys(statusLabels) as Status[]).map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
        <label>주최<input value={form.organizer} onChange={(event) => setField("organizer", event.target.value)} maxLength={160} required disabled={saving} /></label>
        <label>지역<input value={form.region} onChange={(event) => setField("region", event.target.value)} maxLength={120} required disabled={saving} /></label>
        <label className={styles.wide}>신청·진행 기간<input value={form.applicationPeriod} onChange={(event) => setField("applicationPeriod", event.target.value)} maxLength={160} required disabled={saving} /></label>
        <label className={styles.wide}>공식 원문 HTTPS 주소<input type="url" value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} placeholder="https://" required disabled={saving} /></label>
        <label>출처 표기<input value={form.sourceLabel} onChange={(event) => setField("sourceLabel", event.target.value)} maxLength={160} required disabled={saving} /></label>
        <label>기준일<input type="date" value={form.sourceDate} onChange={(event) => setField("sourceDate", event.target.value)} required disabled={saving} /></label>
      </div>
      <label className={styles.publicToggle}><input type="checkbox" checked={form.isPublic} onChange={(event) => setField("isPublic", event.target.checked)} disabled={saving} /><span><strong>공개 목록에 표시</strong><small>체크하지 않으면 운영자 목록에만 보입니다.</small></span></label>
      <button className={styles.save} type="submit" disabled={saving || form.audienceRoles.length === 0}><FilePlus2 size={17} aria-hidden="true" />{saving ? "저장 중…" : editingId ? "수정 저장" : "항목 등록"}</button>
    </form>
    <div className={styles.listHeader}><h3>등록된 항목</h3><span>{items.length}건</span><button className={styles.refresh} type="button" onClick={() => void load()}><RefreshCcw size={16} aria-hidden="true" />새로고침</button></div>
    {items.length === 0 ? <p className={styles.empty}><CalendarDays size={18} aria-hidden="true" />아직 등록한 정책·행사 항목이 없어요.</p> : <div className={styles.list}>{items.map((item) => <article className={styles.card} key={item.id}><div className={styles.cardTop}><div><div className={styles.badges}><span data-public={item.isPublic}>{item.isPublic ? "공개" : "비공개"}</span><span>{categoryLabels[item.category]}</span><span>{statusLabels[item.status]}</span></div><h4>{item.title}</h4></div><time>{item.sourceDate}</time></div><p>{item.summary}</p><dl><div><dt>대상</dt><dd>{item.audienceRoles.map((role) => roleLabels[role]).join(", ")}</dd></div><div><dt>출처</dt><dd>{item.sourceLabel}</dd></div><div><dt>주최·지역</dt><dd>{item.organizer} · {item.region}</dd></div></dl><a href={item.sourceUrl} target="_blank" rel="noreferrer">공식 원문 열기</a><div className={styles.cardActions}><button type="button" onClick={() => edit(item)} disabled={deletingId === item.id}><Pencil size={16} aria-hidden="true" />수정</button><button type="button" onClick={() => void remove(item.id)} disabled={deletingId === item.id}><Trash2 size={16} aria-hidden="true" />{deletingId === item.id ? "삭제 중…" : "삭제"}</button></div></article>)}</div>}
  </section>;
}

function Header({ title }: { title: string }) { return <div className={styles.header}><CalendarDays aria-hidden="true" /><div><p>공개 정보 운영</p><h2 id="public-information-title">{title}</h2></div></div>; }
