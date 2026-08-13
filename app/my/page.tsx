"use client";

import {
  Bell,
  ChevronRight,
  CircleAlert,
  Headphones,
  IdCard,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { institutions } from "@/lib/demo-data";
import { roleLabels, zoneLabels } from "@/lib/labels";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAccountDeletionRequest, requestAccountDeletion, type AccountDeletionRequest, type AccountDeletionRequestSource } from "@/lib/account-operations";
import type { InstitutionType, UserRole } from "@/lib/types";
import styles from "./my.module.css";

const roleOptions: UserRole[] = ["PARENT", "STUDENT", "TEACHER"];
const profileFieldLabels: Record<string, string> = { gradeRange: "학년 구간", childGradeRange: "자녀 학년 구간", interests: "관심 분야", maxDistance: "이동 거리", commuteDistance: "통학거리", preferredTime: "선호 시간대", budget: "예산", occupation: "직군", institutionType: "기관 유형", preferredArea: "희망 지역", serviceZone: "관심 지역" };

type CanonicalFavoriteInstitution = {
  publicSlug: string;
  name: string;
  type: InstitutionType;
  zone: string;
};

type ChildProfile = { id: string; alias: string; gradeLevel: string; createdAt: string; updatedAt: string };
type ConsentEvent = { id: string; ageBand: "UNDER_14" | "FOURTEEN_PLUS" | "ADULT"; termsVersion: string; privacyVersion: string; communityVersion: string; consentedAt: string };

interface MenuItem {
  title: string;
  helper: string;
  action: string;
  icon: LucideIcon;
  href?: string;
  danger?: boolean;
}

const menuItems: MenuItem[] = [
  {
    title: "개인정보 관리",
    helper: "이용·근무 관계와 튜터 본인·자격 인증 요청을 확인합니다.",
    action: "인증 요청",
    icon: IdCard,
    href: "/trust-center",
  },
  {
    title: "알림함",
    helper: "계정 알림을 확인하고 인증·후기·기관·튜터·알림장 수신 여부를 고릅니다.",
    action: "알림 설정",
    icon: Bell,
    href: "/activity",
  },
  {
    title: "고객센터",
    helper: "서비스 문의와 운영자 답변을 확인합니다.",
    action: "접수하기",
    icon: Headphones,
    href: "/support",
  },
];

export default function MyPage() {
  const router = useRouter();
  const { role, roles, zone, setRole, addRole, ageBand, consentVersion, consentedAt, onboardingComplete, roleProfile, accountAuthStatus, favorites, updateRoleProfile } = useApp();
  const [message, setMessage] = useState("현재 MY 화면은 실제 서버 연결 전 체험 상태입니다.");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRequest | null>(null);
  const [deletionSource, setDeletionSource] = useState<AccountDeletionRequestSource>("local-demo");
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState("");
  const [canonicalInstitutions, setCanonicalInstitutions] = useState<CanonicalFavoriteInstitution[]>([]);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState("");
  const [childAlias, setChildAlias] = useState("");
  const [childGradeLevel, setChildGradeLevel] = useState("");
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [deletingChildId, setDeletingChildId] = useState<string | null>(null);
  const [childSaving, setChildSaving] = useState(false);
  const [consentEvents, setConsentEvents] = useState<ConsentEvent[]>([]);
  const [consentEventsLoading, setConsentEventsLoading] = useState(false);
  const [consentEventsError, setConsentEventsError] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileFields, setProfileFields] = useState<Record<string, string>>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const supabaseConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = createBrowserSupabaseClient();
    if (!client) return;
    void client.auth.getSession().then((result) => {
      setAccountEmail(result?.data.session?.user.email ?? null);
    });
  }, [supabaseConfigured]);

  useEffect(() => {
    if (supabaseConfigured && accountAuthStatus === "authenticated") {
      void fetch("/api/account-deletion").then(async (response) => {
        const data = await response.json() as { request?: AccountDeletionRequest | null };
        if (!response.ok) throw new Error();
        setDeletionRequest(data.request ?? null);
        setDeletionSource("server");
      }).catch(() => setMessage("서버 탈퇴 요청 상태를 불러오지 못했어요."));
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setDeletionRequest(getAccountDeletionRequest());
      setDeletionSource("local-demo");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountAuthStatus, supabaseConfigured]);

  useEffect(() => {
    if (!supabaseConfigured || accountAuthStatus !== "authenticated") {
      return;
    }
    const client = createBrowserSupabaseClient();
    if (!client) {
      const frame = window.requestAnimationFrame(() => setConsentEventsError("계정 동의 이력을 불러올 연결을 준비하지 못했어요."));
      return () => window.cancelAnimationFrame(frame);
    }
    let active = true;
    const loadConsentEvents = async () => {
      setConsentEventsLoading(true);
      setConsentEventsError("");
      try {
        const { data, error } = await client
          .from("user_consent_events")
          .select("id, age_band, terms_version, privacy_version, community_version, consented_at")
          .order("consented_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!active) return;
        setConsentEvents((data ?? []).flatMap((event) => {
          const ageBand = event.age_band;
          if ((ageBand !== "UNDER_14" && ageBand !== "FOURTEEN_PLUS" && ageBand !== "ADULT") || !event.consented_at) return [];
          return [{ id: String(event.id), ageBand, termsVersion: String(event.terms_version), privacyVersion: String(event.privacy_version), communityVersion: String(event.community_version), consentedAt: String(event.consented_at) }];
        }));
      } catch (error) {
        if (active) setConsentEventsError(error instanceof Error ? error.message : "계정 동의 이력을 불러오지 못했어요.");
      } finally {
        if (active) setConsentEventsLoading(false);
      }
    };
    void loadConsentEvents();
    return () => { active = false; };
  }, [accountAuthStatus, supabaseConfigured]);

  const loadChildren = async () => {
    setChildrenLoading(true);
    setChildrenError("");
    try {
      const response = await fetch("/api/children");
      const payload = await response.json() as { children?: ChildProfile[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "자녀 프로필을 불러오지 못했어요.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
    } catch (error) {
      setChildren([]);
      setChildrenError(error instanceof Error ? error.message : "자녀 프로필을 불러오지 못했어요.");
    } finally { setChildrenLoading(false); }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!supabaseConfigured || accountAuthStatus !== "authenticated" || !roles.includes("PARENT")) {
        setChildren([]);
        setChildrenError("");
        return;
      }
      void loadChildren();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountAuthStatus, roles, supabaseConfigured]);

  useEffect(() => {
    if (!supabaseConfigured || accountAuthStatus !== "authenticated") return;
    const frame = window.requestAnimationFrame(() => {
      setFavoritesLoading(true);
      setFavoritesError("");
      void Promise.all([fetch("/api/favorites"), fetch("/api/institutions")]).then(async ([favoritesResponse, institutionsResponse]) => {
        const favoritesPayload = await favoritesResponse.json() as { error?: string };
        const institutionsPayload = await institutionsResponse.json() as { mode?: string; error?: string; institutions?: CanonicalFavoriteInstitution[] };
        if (!favoritesResponse.ok) throw new Error(favoritesPayload.error ?? "계정 관심 기관을 불러오지 못했어요.");
        if (!institutionsResponse.ok || institutionsPayload.mode !== "canonical") throw new Error(institutionsPayload.error ?? "공개 기관 정보를 불러오지 못했어요.");
        setCanonicalInstitutions(institutionsPayload.institutions ?? []);
      }).catch((error) => setFavoritesError(error instanceof Error ? error.message : "계정 관심 기관을 불러오지 못했어요.")).finally(() => setFavoritesLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountAuthStatus, supabaseConfigured]);

  useEffect(() => {
    const handleFavoriteError = (event: Event) => setFavoritesError((event as CustomEvent<string>).detail);
    window.addEventListener("edutalk:favorites-error", handleFavoriteError);
    return () => window.removeEventListener("edutalk:favorites-error", handleFavoriteError);
  }, []);

  useEffect(() => {
    const handlePreferenceError = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("edutalk:preference-error", handlePreferenceError);
    return () => window.removeEventListener("edutalk:preference-error", handlePreferenceError);
  }, []);

  const accountFavorites = useMemo(
    () => canonicalInstitutions.filter((institution) => favorites.includes(institution.publicSlug)),
    [canonicalInstitutions, favorites],
  );
  const missingAccountFavoriteCount = Math.max(0, favorites.length - accountFavorites.length);

  const startProfileEdit = () => {
    if (!roleProfile) { router.push("/onboarding?review=policies"); return; }
    setProfileFields(roleProfile.fields);
    setProfileError("");
    setProfileEditing(true);
  };

  const saveProfile = async () => {
    if (!roleProfile || profileSaving) return;
    const editable = Object.fromEntries(Object.entries(profileFields).filter(([key]) => key !== "serviceZone").map(([key, value]) => [key, value.trim()]));
    if (Object.values(editable).some((value) => !value)) { setProfileError("추천 기준을 모두 입력해 주세요."); return; }
    setProfileSaving(true);
    setProfileError("");
    const result = await updateRoleProfile(editable);
    setProfileSaving(false);
    if (!result.ok) { setProfileError(result.error ?? "추천 프로필을 저장하지 못했어요."); return; }
    setProfileEditing(false);
    setMessage(supabaseConfigured && accountAuthStatus === "authenticated" ? "추천 프로필을 계정에 저장했어요." : "추천 프로필을 이 기기에 저장했어요.");
  };

  function submitDeletionRequest() {
    if (!deletionConfirmed || deletionRequest) return;
    if (supabaseConfigured && accountAuthStatus === "authenticated") {
      void fetch("/api/account-deletion", { method: "POST" }).then(async (response) => {
        const data = await response.json() as { request?: AccountDeletionRequest; error?: string };
        if (!response.ok || !data.request) throw new Error(data.error);
        setDeletionRequest(data.request);
        setDeletionSource("server");
        setMessage("계정의 탈퇴 요청을 저장했어요. 운영자 확인 전에는 계정이 유지됩니다.");
      }).catch((error) => setMessage(error instanceof Error ? error.message : "탈퇴 요청을 접수하지 못했어요."));
      return;
    }
    const request = requestAccountDeletion();
    setDeletionRequest(request);
    setDeletionSource("local-demo");
    setMessage("브라우저 체험용 탈퇴 요청을 접수했어요. 실제 계정은 삭제되지 않았습니다.");
  }

  async function startOAuth(provider: "google" | "kakao") {
    setAuthBusy(true);
    setMessage("");
    try {
      const client = createBrowserSupabaseClient();
      if (!client) throw new Error("연결 설정이 필요합니다.");
      const next = onboardingComplete ? "/my" : "/onboarding";
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/auth/callback?next=${next}` } });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인을 시작하지 못했습니다.");
      setAuthBusy(false);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) { setMessage("이메일 주소를 입력해 주세요."); return; }
    setAuthBusy(true);
    setMessage("");
    try {
      const client = createBrowserSupabaseClient();
      if (!client) throw new Error("연결 설정이 필요합니다.");
      const next = onboardingComplete ? "/my" : "/onboarding";
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/auth/callback?next=${next}` } });
      if (error) throw error;
      setMessage("로그인 링크를 이메일로 보냈어요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 링크를 보내지 못했습니다.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    const client = createBrowserSupabaseClient();
    const { error } = await client?.auth.signOut() ?? { error: null };
    setAccountEmail(null);
    setMessage(error ? error.message : "로그아웃했어요.");
    setAuthBusy(false);
    if (!error) router.replace("/login");
  }

  const handleRoleClick = (nextRole: UserRole) => {
    if (nextRole === "STUDENT" && ageBand === "UNDER_14") {
      setMessage("만 14세 미만은 독립 학생 역할을 추가할 수 없어요. 학부모 역할 아래 자녀 프로필로 관리해 주세요.");
      return;
    }

    if (!roles.includes(nextRole) && supabaseConfigured && accountAuthStatus === "authenticated") {
      setMessage("새 역할은 역할별 최소 프로필과 동의를 확인한 뒤 추가할 수 있어요.");
      router.push("/onboarding?review=policies");
      return;
    }

    if (!roles.includes(nextRole)) {
      addRole(nextRole);
      setRole(nextRole);
      setMessage(`${roleLabels[nextRole]} 역할을 추가하고 전환했어요.`);
      return;
    }

    setRole(nextRole);
    setMessage(`${roleLabels[nextRole]} 역할로 전환했어요.`);
  };

  const resetChildForm = () => {
    setEditingChildId(null);
    setChildAlias("");
    setChildGradeLevel("");
  };

  const saveChild = async () => {
    if (!childAlias.trim() || !childGradeLevel.trim() || childSaving) return;
    setChildSaving(true);
    setChildrenError("");
    try {
      const response = await fetch("/api/children", {
        method: editingChildId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingChildId ? { id: editingChildId, alias: childAlias.trim(), gradeLevel: childGradeLevel.trim() } : { alias: childAlias.trim(), gradeLevel: childGradeLevel.trim() }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "자녀 프로필을 저장하지 못했어요.");
      resetChildForm();
      await loadChildren();
      setMessage("자녀 프로필을 계정에 저장했어요.");
    } catch (error) { setChildrenError(error instanceof Error ? error.message : "자녀 프로필을 저장하지 못했어요."); }
    finally { setChildSaving(false); }
  };

  const startChildEdit = (child: ChildProfile) => {
    setEditingChildId(child.id);
    setChildAlias(child.alias);
    setChildGradeLevel(child.gradeLevel);
  };

  const deleteChild = async (id: string) => {
    if (deletingChildId !== id || childSaving) { setDeletingChildId(id); return; }
    setChildSaving(true);
    setChildrenError("");
    try {
      const response = await fetch("/api/children", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "자녀 프로필을 삭제하지 못했어요.");
      if (editingChildId === id) resetChildForm();
      setDeletingChildId(null);
      await loadChildren();
      setMessage("자녀 프로필을 삭제했어요.");
    } catch (error) { setChildrenError(error instanceof Error ? error.message : "자녀 프로필을 삭제하지 못했어요."); }
    finally { setChildSaving(false); }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>MY</p>
        <h1>내 역할과 계정 설정</h1>
        <p>학부모, 학생, 선생님 관점이 섞이지 않도록 현재 역할을 분명히 보여줍니다.</p>
      </header>

      <section className={styles.profileCard} aria-labelledby="my-current-role">
        <div className={styles.avatar} aria-hidden="true">
          <UserRound />
        </div>
        <div className={styles.profileText}>
          <p className={styles.kicker}>현재 역할</p>
          <h2 id="my-current-role">{roleLabels[role]}</h2>
          <p>{accountEmail ? `${accountEmail} 계정으로 연결되어 있습니다.` : `${zoneLabels[zone]} 기준으로 추천과 후기를 보여주는 체험 계정입니다.`}</p>
        </div>
        <div className={styles.statusPill}>
          <ShieldCheck aria-hidden="true" />
          {accountEmail ? "계정 연결됨" : supabaseConfigured ? "로그인 전" : "서버 연결 전"}
        </div>
      </section>

      {supabaseConfigured && accountAuthStatus === "authenticated" ? <section className={styles.tutorActivityCard} aria-labelledby="tutor-activity-title"><div><p className={styles.kicker}>별도 활동 프로필</p><h2 id="tutor-activity-title">튜터 활동 프로필</h2><p>학부모·학생·선생님 역할을 바꾸지 않고, 이 계정으로 튜터 소개와 인증 신청을 관리할 수 있어요.</p></div><Link href="/tutors">등록·관리하기<ChevronRight aria-hidden="true" /></Link></section> : null}

      <section className={styles.consentSection} aria-labelledby="consent-status-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>이용 상태</p><h2 id="consent-status-title">연령대와 동의 확인</h2></div><Link href="/onboarding?review=policies">정책 다시보기</Link></div>
        <div className={styles.consentStatus}><div><span>현재 연령대</span><strong>{ageBand === "UNDER_14" ? "만 14세 미만 · 보호자 아래 자녀 프로필" : ageBand === "FOURTEEN_PLUS" ? "만 14세 이상" : ageBand === "ADULT" ? "성인" : "아직 선택 안 함"}</strong></div><div><span>필수 동의</span><strong>{consentVersion && consentedAt ? `${consentVersion} · ${consentedAt.slice(0, 10)} 확인` : "아직 확인 안 함"}</strong></div></div>
        {supabaseConfigured && accountAuthStatus === "authenticated" ? <div className={styles.consentHistory}><strong>최근 계정 동의 이력</strong>{consentEventsLoading ? <p>불러오는 중이에요.</p> : consentEventsError ? <p className={styles.consentHistoryError} role="alert">{consentEventsError}</p> : consentEvents.length === 0 ? <p>아직 저장된 동의 이력이 없어요.</p> : <ul>{consentEvents.map((event) => <li key={event.id}><time dateTime={event.consentedAt}>{event.consentedAt.slice(0, 10)}</time><span>{event.ageBand === "UNDER_14" ? "만 14세 미만" : event.ageBand === "FOURTEEN_PLUS" ? "만 14세 이상" : "성인"}</span><small>이용 {event.termsVersion} · 개인정보 {event.privacyVersion} · 커뮤니티 {event.communityVersion}</small></li>)}</ul>}</div> : null}
        <p className={styles.consentCaption}>표시 내용은 출시 전 검토용 요약입니다. 실제 서비스 전 정식 약관과 개인정보 처리방침을 확인해야 합니다.</p>
      </section>

      <section className={styles.roleProfileSection} aria-labelledby="role-profile-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>추천 프로필</p><h2 id="role-profile-title">현재 최소 프로필</h2></div>{roleProfile ? <button type="button" className={styles.profileEditButton} onClick={startProfileEdit}>{profileEditing ? "편집 중" : "수정"}</button> : null}</div>
        {roleProfile && profileEditing ? <div className={styles.profileForm}>{Object.entries(profileFields).filter(([key]) => key !== "serviceZone").map(([key, value]) => <label key={key}>{profileFieldLabels[key] ?? key}<input value={value} maxLength={200} onChange={(event) => setProfileFields((current) => ({ ...current, [key]: event.target.value }))} /></label>)}{profileError ? <p className={styles.profileError} role="alert">{profileError}</p> : null}<div><button type="button" onClick={() => void saveProfile()} disabled={profileSaving}>{profileSaving ? "저장 중" : "추천 기준 저장"}</button><button type="button" onClick={() => { setProfileEditing(false); setProfileError(""); }} disabled={profileSaving}>취소</button></div></div> : roleProfile ? <div className={styles.roleProfileList}><strong>{roleLabels[roleProfile.role]} 기준</strong>{Object.entries(roleProfile.fields).map(([key, value]) => <div key={key}><span>{profileFieldLabels[key] ?? key}</span><b>{value}</b></div>)}</div> : <p className={styles.profileEmpty}>아직 최소 프로필을 입력하지 않았어요. 온보딩에서 추천 기준을 설정해 주세요.</p>}
      </section>

      <section className={styles.childrenSection} aria-labelledby="children-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>보호자 아래 이용</p><h2 id="children-title">자녀 프로필</h2></div><span>{childrenLoading ? "불러오는 중" : `${children.length}명`}</span></div>
        <p className={styles.childrenNotice}>실명, 학교명, 생년월일은 입력하지 않습니다. 자녀를 구분할 별칭과 학년만 관리해요.</p>
        {!supabaseConfigured ? <p className={styles.profileEmpty}>체험 모드에서는 실제 아동 정보를 입력하거나 저장하지 않습니다. 계정을 연결한 학부모 역할에서만 자녀 프로필을 관리할 수 있어요.</p> : accountAuthStatus !== "authenticated" ? <p className={styles.profileEmpty}>로그인한 학부모 계정에서 자녀 프로필을 관리할 수 있어요.</p> : !roles.includes("PARENT") ? <p className={styles.profileEmpty}>학부모 역할을 추가한 뒤 자녀 프로필을 관리할 수 있어요. 만 14세 미만은 보호자 아래에서 이용합니다.</p> : <>
          {childrenError ? <p className={styles.childrenError} role="alert">{childrenError}</p> : null}
          {childrenLoading ? <p className={styles.profileEmpty}>계정 자녀 프로필을 불러오는 중이에요.</p> : children.length === 0 ? <p className={styles.profileEmpty}>등록한 자녀 프로필이 없어요. 별칭과 학년으로 먼저 추가해 주세요.</p> : <div className={styles.childrenList}>{children.map((child) => <article key={child.id}><div><strong>{child.alias}</strong><span>{child.gradeLevel}</span></div><div><button type="button" onClick={() => startChildEdit(child)} disabled={childSaving}>수정</button><button type="button" onClick={() => void deleteChild(child.id)} disabled={childSaving}>{deletingChildId === child.id ? "한 번 더 눌러 삭제" : "삭제"}</button></div></article>)}</div>}
          <div className={styles.childForm}>
            <label>자녀 별칭<input value={childAlias} onChange={(event) => setChildAlias(event.target.value)} maxLength={24} placeholder="예: 민트" /></label>
            <label>학년<input value={childGradeLevel} onChange={(event) => setChildGradeLevel(event.target.value)} maxLength={40} placeholder="예: 초등 4학년" /></label>
            <div><button type="button" onClick={() => void saveChild()} disabled={childSaving || !childAlias.trim() || !childGradeLevel.trim()}>{childSaving ? "저장 중" : editingChildId ? "수정 저장" : "자녀 프로필 추가"}</button>{editingChildId ? <button type="button" onClick={resetChildForm} disabled={childSaving}>편집 취소</button> : null}</div>
          </div>
        </>}
      </section>

      <section className={styles.favoritesSection} aria-labelledby="favorites-title">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>관심 기관</p><h2 id="favorites-title">저장한 기관</h2></div><span>{favoritesLoading ? "불러오는 중" : `${supabaseConfigured && accountAuthStatus === "authenticated" ? accountFavorites.length : favorites.length}곳`}</span></div>
        {favoritesError ? <p className={styles.favoritesError} role="alert">{favoritesError}</p> : null}
        {favoritesLoading ? <p className={styles.profileEmpty}>계정에 저장한 공개 기관을 불러오는 중이에요.</p> : supabaseConfigured && accountAuthStatus === "authenticated" ? (accountFavorites.length === 0 ? <p className={styles.profileEmpty}>{favorites.length ? "저장된 관심 기관이 현재 공개 canonical 데이터에 없어 표시하지 않습니다." : "계정에 저장한 관심 기관이 없어요."}</p> : <><div className={styles.favoritesList}>{accountFavorites.map((institution) => <Link href={`/institutions/${institution.publicSlug}`} key={institution.publicSlug}>{institution.name}<ChevronRight aria-hidden="true" /></Link>)}</div>{missingAccountFavoriteCount ? <p className={styles.profileEmpty}>저장된 관심 기관 중 {missingAccountFavoriteCount}곳은 현재 공개 canonical 데이터에 없어 표시하지 않습니다.</p> : null}</>) : favorites.length === 0 ? <p className={styles.profileEmpty}>체험 화면에서 관심 기관을 저장하면 이곳에서 확인할 수 있어요.</p> : <div className={styles.favoritesList}>{favorites.map((id) => <Link href={`/institutions/${id}`} key={id}>{institutions.find((institution) => institution.id === id)?.name ?? "저장한 기관"}<ChevronRight aria-hidden="true" /></Link>)}</div>}
      </section>

      <p className={styles.notice} role="status">
        <CircleAlert aria-hidden="true" />
        {message}
      </p>

      <section className={styles.authSection} aria-labelledby="account-login-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>계정 연결</p>
            <h2 id="account-login-title">{accountEmail ? "로그인한 계정" : "로그인으로 내 설정을 연결하세요"}</h2>
          </div>
        </div>
        {accountEmail ? (
          <div className={styles.signedIn}><div><strong>{accountEmail}</strong><span>현재 로그인한 계정이에요.</span></div><button type="button" onClick={signOut} disabled={authBusy}>로그아웃</button></div>
        ) : supabaseConfigured ? (
          <div className={styles.loginOptions}>
            <div className={styles.oauthRow}><button type="button" onClick={() => startOAuth("google")} disabled={authBusy}>Google로 계속</button><button type="button" onClick={() => startOAuth("kakao")} disabled={authBusy}>Kakao로 계속</button></div>
            <label className={styles.magicLink}>이메일 매직링크<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /><button type="button" onClick={sendMagicLink} disabled={authBusy || !email.trim()}>로그인 링크 보내기</button></label>
            <p className={styles.oidcNotice}>네이버 로그인은 별도 OIDC 연결이 필요합니다.</p>
          </div>
        ) : (
          <div className={styles.authUnavailable}><strong>계정 연결 설정 필요</strong><span>Supabase 환경값을 연결하면 Google, Kakao, 이메일 로그인을 사용할 수 있어요.</span><p>네이버 로그인은 별도 OIDC 연결이 필요합니다.</p></div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="my-role-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>역할 관리</p>
            <h2 id="my-role-title">보유 역할 추가와 전환</h2>
          </div>
          <span>{roles.length}개 보유</span>
        </div>

        <div className={styles.roleGrid}>
          {roleOptions.map((option) => {
            const isOwned = roles.includes(option);
            const isActive = role === option;
            const isUnder14Student = option === "STUDENT" && ageBand === "UNDER_14";

            return (
              <button
                type="button"
                className={`${styles.roleButton} ${isActive ? styles.activeRole : ""} ${isUnder14Student ? styles.disabledRole : ""}`}
                onClick={() => handleRoleClick(option)}
                aria-pressed={isActive}
                aria-disabled={isUnder14Student}
                disabled={isUnder14Student}
                key={option}
              >
                <span>
                  <strong>{roleLabels[option]}</strong>
                  <small>{isUnder14Student ? "보호자 아래 이용" : isOwned ? "보유 중" : "추가 가능"}</small>
                </span>
                <em>{isUnder14Student ? "제한" : isActive ? "현재" : isOwned ? "전환" : "추가"}</em>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="my-account-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>계정 메뉴</p>
            <h2 id="my-account-title">개인정보와 지원 메뉴</h2>
          </div>
        </div>

        <div className={styles.menuList}>
          {menuItems.map((item) => {
            const Icon = item.icon;

            const content = <>
                <span className={styles.menuIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <span className={styles.menuText}>
                  <strong>{item.title}</strong>
                  <small>{item.helper}</small>
                </span>
                <span className={styles.menuAction}>
                  {item.action}
                  <ChevronRight aria-hidden="true" />
                </span>
              </>;
            const className = `${styles.menuButton} ${item.danger ? styles.dangerMenu : ""}`;

            return item.href ? (
              <Link href={item.href} className={className} key={item.title}>{content}</Link>
            ) : (
              <button type="button" className={className} onClick={() => setMessage(`${item.title}은 실제 서버 연결 뒤 활성화됩니다.`)} key={item.title}>{content}</button>
            );
          })}
        </div>
      </section>

      <section className={styles.deletionSection} aria-labelledby="deletion-request-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>계정 탈퇴</p>
            <h2 id="deletion-request-title">탈퇴 요청 접수</h2>
          </div>
        </div>
        <div className={styles.deletionImpact}>
          <strong>요청 전 확인해 주세요</strong>
          <p>운영자 최종 확인 뒤 계정, 개인 인공지능 초안, 대화, 비공개 증빙과 계정 소유 데이터가 삭제됩니다. 학생 성적처럼 다른 연결 사용자가 함께 보는 기록은 작성자 식별자만 제거될 수 있습니다. 요청 즉시 삭제되지는 않습니다.</p>
        </div>
        {deletionRequest ? (
          <p className={styles.deletionPending} role="status"><strong>탈퇴 요청 접수됨</strong><span>{deletionRequest.requestedAt.slice(0, 16).replace("T", " ")} · {deletionSource === "server" ? "계정 요청 저장됨 · 운영자 확인 대기" : "브라우저 체험 요청 · 서버 미연결"}</span></p>
        ) : (
          <div className={styles.deletionForm}>
            <label><input type="checkbox" checked={deletionConfirmed} onChange={(event) => setDeletionConfirmed(event.target.checked)} /><span>영향 설명을 확인했고, {supabaseConfigured && accountAuthStatus === "authenticated" ? "계정의 탈퇴 요청을 저장" : "브라우저 체험용 탈퇴 요청을 접수"}하는 데 동의합니다.</span></label>
            <button type="button" onClick={submitDeletionRequest} disabled={!deletionConfirmed}>탈퇴 요청 접수</button>
          </div>
        )}
      </section>

      <footer className={styles.signOutBox}>
        <LogOut aria-hidden="true" />
        <div>
          <h2>로그아웃과 세션 관리</h2>
          <p>{accountEmail ? "Supabase 계정 세션을 종료할 수 있습니다." : "현재는 로그인된 서버 세션이 없습니다."}</p>
        </div>
      </footer>
    </main>
  );
}
