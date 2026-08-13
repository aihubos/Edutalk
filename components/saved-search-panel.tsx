"use client";

import Link from "next/link";
import { BookmarkPlus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { institutionTypeLabels, zoneLabels } from "@/lib/labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { InstitutionType, ServiceZone, SortOption } from "@/lib/types";
import styles from "./saved-search-panel.module.css";

type SavedSearchSort = SortOption | "NAME" | "CHECKED";
type SavedSearch = { id: string; label: string; query: string; zone: ServiceZone; institutionType: InstitutionType | "ALL"; sort: SavedSearchSort; pickup: boolean; trial: boolean; path: string; createdAt: string };
type CurrentSearch = Omit<SavedSearch, "id" | "label" | "path" | "createdAt">;

const localKey = "edutalk-saved-searches-v1";
const sortLabels: Record<SavedSearchSort, string> = { RECOMMENDED: "추천순", DISTANCE: "거리순", RATING: "평점순", REVIEWS: "후기 많은순", PRICE: "비용 낮은순", NAME: "이름순", CHECKED: "최근 확인일순" };

function buildPath(search: CurrentSearch) {
  const params = new URLSearchParams();
  if (search.query) params.set("q", search.query);
  if (search.zone !== "ALL") params.set("zone", search.zone);
  if (search.institutionType !== "ALL") params.set("type", search.institutionType);
  if (search.sort !== "RECOMMENDED" && search.sort !== "NAME") params.set("sort", search.sort);
  if (search.pickup) params.set("pickup", "true");
  if (search.trial) params.set("trial", "true");
  return params.size ? `/discover?${params}` : "/discover";
}

function readLocal(): SavedSearch[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey) ?? "[]") as SavedSearch[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch { return []; }
}

export function SavedSearchPanel({ current }: { current: CurrentSearch }) {
  const { accountAuthStatus } = useApp();
  const configured = isSupabaseConfigured();
  const serverMode = configured && accountAuthStatus === "authenticated";
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [label, setLabel] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const summary = useMemo(() => [
    current.query ? `“${current.query}”` : null,
    zoneLabels[current.zone],
    current.institutionType === "ALL" ? "전체 유형" : institutionTypeLabels[current.institutionType],
    sortLabels[current.sort],
    current.pickup ? "통학차량" : null,
    current.trial ? "체험수업" : null,
  ].filter(Boolean).join(" · "), [current]);

  const load = useCallback(async () => {
    setError("");
    if (!serverMode) { setItems(readLocal()); setLoaded(true); return; }
    try {
      const response = await fetch("/api/saved-searches");
      const payload = await response.json() as { savedSearches?: SavedSearch[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "저장한 검색을 불러오지 못했어요.");
      setItems(payload.savedSearches ?? []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "저장한 검색을 불러오지 못했어요."); }
    finally { setLoaded(true); }
  }, [serverMode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const save = async () => {
    if (!label.trim() || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      if (serverMode) {
        if (current.zone === "ALL") throw new Error("계정 검색은 동탄1 또는 동탄2 지역을 선택한 뒤 저장해 주세요.");
        const response = await fetch("/api/saved-searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...current, label: label.trim() }) });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "검색 조건을 저장하지 못했어요.");
        await load();
        setNotice("검색 조건을 계정에 저장했어요.");
      } else {
        const next: SavedSearch = { id: `local-${Date.now()}`, label: label.trim(), ...current, path: buildPath(current), createdAt: new Date().toISOString() };
        const updated = [next, ...readLocal().filter((item) => item.label !== next.label)].slice(0, 10);
        localStorage.setItem(localKey, JSON.stringify(updated));
        setItems(updated);
        setNotice("체험 검색을 이 브라우저에 저장했어요.");
      }
      setLabel("");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "검색 조건을 저장하지 못했어요."); }
    finally { setSaving(false); }
  };

  const remove = async (item: SavedSearch) => {
    setSaving(true); setError(""); setNotice("");
    try {
      if (serverMode) {
        const response = await fetch("/api/saved-searches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "저장 검색을 삭제하지 못했어요.");
        await load();
      } else {
        const updated = readLocal().filter((entry) => entry.id !== item.id);
        localStorage.setItem(localKey, JSON.stringify(updated));
        setItems(updated);
      }
      setNotice("저장 검색을 삭제했어요.");
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "저장 검색을 삭제하지 못했어요."); }
    finally { setSaving(false); }
  };

  return <section className={styles.panel} aria-labelledby="saved-searches-title">
    <div className={styles.header}><div><p>내 동네 조건</p><h2 id="saved-searches-title">이 검색을 다시 열 수 있게 저장해요</h2><span>{summary}</span></div><BookmarkPlus aria-hidden="true" /></div>
    <div className={styles.saveRow}><label><span className="sr-only">저장 검색 이름</span><input value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} placeholder="예: 민트 수학 통학차량" /></label><button type="button" onClick={() => void save()} disabled={!label.trim() || saving || (serverMode && current.zone === "ALL")}>{saving ? "저장 중" : "현재 조건 저장"}</button></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {!loaded ? <p className={styles.empty}>저장한 검색을 불러오는 중이에요.</p> : items.length === 0 ? <p className={styles.empty}>아직 저장한 검색이 없어요. 자주 보는 조건에 이름을 붙여 저장해 보세요.</p> : <ul className={styles.list}>{items.map((item) => <li key={item.id}><Link href={item.path}><Search aria-hidden="true" /><span><strong>{item.label}</strong><small>{[item.query || null, zoneLabels[item.zone], item.institutionType === "ALL" ? "전체 유형" : institutionTypeLabels[item.institutionType]].filter(Boolean).join(" · ")}</small></span></Link><button type="button" aria-label={`${item.label} 저장 검색 삭제`} onClick={() => void remove(item)} disabled={saving}><Trash2 aria-hidden="true" /></button></li>)}</ul>}
    <p className={styles.boundary}>{serverMode ? current.zone === "ALL" ? "동탄1 또는 동탄2를 선택하면 계정에 저장할 수 있어요." : "로그인 계정에 최대 10개까지 저장합니다." : configured ? "로그인하면 검색 조건을 계정에 연결할 수 있어요." : "체험 모드에서는 이 브라우저에만 최대 10개까지 저장합니다."}</p>
  </section>;
}
