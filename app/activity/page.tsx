"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Bell, Bookmark, Building2, CheckCheck, CheckCircle2, ChevronRight, Clock3, Columns3, FilePenLine, Settings2, ShieldAlert } from "lucide-react";
import { institutions } from "@/lib/demo-data";
import { useApp } from "@/lib/app-context";
import { formatDistance, institutionTypeLabels, roleLabels } from "@/lib/labels";
import type { Institution, UserRole } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AccountNotification } from "@/lib/account-operations";
import {
  defaultNotificationPreferences,
  notificationPreferenceLabels,
  type NotificationKind,
  type NotificationPreference,
} from "@/lib/notification-preferences";
import styles from "./activity.module.css";

const verificationItems = [
  {
    id: "use-confirmation",
    title: "이용 관계 인증",
    status: "체험 대기",
    body: "정식 운영 전에는 재원, 상담, 결제 등 실제 이용 관계를 확인합니다.",
    icon: Clock3,
  },
  {
    id: "work-confirmation",
    title: "근무 관계 인증",
    status: "운영 전 안내",
    body: "선생님 후기는 재직·면접 경험 확인 뒤 별도 기준으로 공개됩니다.",
    icon: ShieldAlert,
  },
];

export default function ActivityPage() {
  const { favorites, comparison, reviewDraft, role, hydrated, accountAuthStatus } = useApp();
  const accountConfigured = isSupabaseConfigured();
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(accountConfigured);
  const [notificationError, setNotificationError] = useState("");
  const [reading, setReading] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreference[]>(defaultNotificationPreferences());
  const [preferencesLoading, setPreferencesLoading] = useState(accountConfigured);
  const [preferencesError, setPreferencesError] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState<NotificationKind | null>(null);
  const [myReviews, setMyReviews] = useState<Array<{ id: string; institution_target_key: string; relation: UserRole; status: string; created_at: string; author_hidden_at: string | null }>>([]);
  const [reviewAddenda, setReviewAddenda] = useState<Array<{ id: string; review_id: string; body: string; status: string; created_at: string }>>([]);
  const [addendumDrafts, setAddendumDrafts] = useState<Record<string, string>>({});
  const [savingAddendumFor, setSavingAddendumFor] = useState("");
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [hidingReviewId, setHidingReviewId] = useState("");
  const serverMode = accountConfigured && accountAuthStatus === "authenticated";
  const unreadNotifications = useMemo(() => notifications.filter((notification) => !notification.readAt), [notifications]);

  const loadNotifications = async () => {
    setNotificationLoading(true);
    setNotificationError("");
    try {
      const response = await fetch("/api/notifications");
      const payload = await response.json() as { notifications?: AccountNotification[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "알림을 불러오지 못했어요.");
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "알림을 불러오지 못했어요.");
    } finally {
      setNotificationLoading(false);
    }
  };

  const loadPreferences = async () => {
    setPreferencesLoading(true);
    setPreferencesError("");
    try {
      const response = await fetch("/api/notification-preferences");
      const payload = await response.json() as { preferences?: NotificationPreference[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "알림 설정을 불러오지 못했어요.");
      setPreferences(Array.isArray(payload.preferences) ? payload.preferences : defaultNotificationPreferences());
    } catch (error) {
      setPreferencesError(error instanceof Error ? error.message : "알림 설정을 불러오지 못했어요.");
    } finally {
      setPreferencesLoading(false);
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!serverMode) {
        setNotifications([]);
        setNotificationError("");
        setNotificationLoading(accountConfigured && accountAuthStatus === "checking");
        setPreferences(defaultNotificationPreferences());
        setPreferencesError("");
        setPreferencesLoading(accountConfigured && accountAuthStatus === "checking");
        return;
      }
      void loadNotifications();
      void loadPreferences();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountAuthStatus, accountConfigured, serverMode]);

  const loadMyReviews = async () => {
    setReviewsLoading(true); setReviewsError("");
    try {
      const response = await fetch("/api/reviews?purpose=mine");
      const payload = await response.json() as { reviews?: Array<{ id: string; institution_target_key: string; relation: UserRole; status: string; created_at: string; author_hidden_at: string | null }>; addenda?: Array<{ id: string; review_id: string; body: string; status: string; created_at: string }>; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "내 후기 목록을 불러오지 못했어요.");
      setMyReviews(payload.reviews ?? []);
      setReviewAddenda(payload.addenda ?? []);
    } catch (error) { setReviewsError(error instanceof Error ? error.message : "내 후기 목록을 불러오지 못했어요."); }
    finally { setReviewsLoading(false); }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!serverMode) { setMyReviews([]); setReviewsError(""); return; }
      void loadMyReviews();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [serverMode]);

  const hideOwnReview = async (id: string) => {
    setHidingReviewId(id); setReviewsError("");
    try {
      const response = await fetch("/api/reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "AUTHOR_HIDE" }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "후기를 내리지 못했어요.");
      setMyReviews((current) => current.map((review) => review.id === id ? { ...review, author_hidden_at: new Date().toISOString() } : review));
    } catch (error) { setReviewsError(error instanceof Error ? error.message : "후기를 내리지 못했어요."); }
    finally { setHidingReviewId(""); }
  };

  const submitAddendum = async (reviewId: string) => {
    const body = (addendumDrafts[reviewId] ?? "").trim();
    if (body.length < 1 || body.length > 1000) { setReviewsError("추가 설명은 1자 이상 1000자 이하로 입력해 주세요."); return; }
    setSavingAddendumFor(reviewId); setReviewsError("");
    try {
      const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADDENDUM", reviewId, body }) });
      const payload = await response.json() as { addendum?: { id: string; reviewId: string; status: string; createdAt: string }; error?: string };
      if (!response.ok || !payload.addendum) throw new Error(payload.error ?? "추가 설명을 접수하지 못했어요.");
      setReviewAddenda((current) => [{ id: payload.addendum!.id, review_id: payload.addendum!.reviewId, body, status: payload.addendum!.status, created_at: payload.addendum!.createdAt }, ...current]);
      setAddendumDrafts((current) => ({ ...current, [reviewId]: "" }));
    } catch (error) { setReviewsError(error instanceof Error ? error.message : "추가 설명을 접수하지 못했어요."); }
    finally { setSavingAddendumFor(""); }
  };

  const markRead = async (ids: string[]) => {
    if (ids.length === 0 || reading) return;
    setReading(true);
    setNotificationError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationIds: ids }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "읽음 상태를 저장하지 못했어요.");
      setNotifications((current) => current.map((notification) => ids.includes(notification.id) ? { ...notification, readAt: new Date().toISOString() } : notification));
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "읽음 상태를 저장하지 못했어요.");
    } finally {
      setReading(false);
    }
  };

  const togglePreference = async (kind: NotificationKind, enabled: boolean) => {
    if (preferenceSaving) return;
    const previous = preferences;
    setPreferenceSaving(kind);
    setPreferencesError("");
    setPreferences((current) => current.map((preference) => preference.kind === kind ? { ...preference, enabled } : preference));
    try {
      const response = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, enabled }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "알림 설정을 저장하지 못했어요.");
    } catch (error) {
      setPreferences(previous);
      setPreferencesError(error instanceof Error ? error.message : "알림 설정을 저장하지 못했어요.");
    } finally {
      setPreferenceSaving(null);
    }
  };
  const savedInstitutions = favorites
    .map((id) => institutions.find((institution) => institution.id === id))
    .filter((institution): institution is Institution => Boolean(institution));
  const draftInstitution = institutions.find((institution) => institution.id === reviewDraft.institutionId);
  const hasDraft = Boolean(reviewDraft.savedAt && reviewDraft.institutionId);

  if (!hydrated) {
    return (
      <main className={styles.page} aria-busy="true">
        <div className={styles.skeletonHero} />
        <div className={styles.skeletonCard} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="activity-title">
        <p className={styles.eyebrow}>내 활동</p>
        <h1 id="activity-title">{accountConfigured ? "내 계정 알림을 확인해요" : "저장한 기관과 인증 현황을 한 번에 봐요"}</h1>
        <p>{accountConfigured ? "계정으로 전달된 알림만 표시합니다. 체험 모드 항목은 함께 표시하지 않습니다." : `${roleLabels[role]} 모드에서 남긴 초안, 저장 기관, 비교 담기를 확인합니다.`}</p>
      </section>

      {serverMode ? <AccountNotifications notifications={notifications} loading={notificationLoading} error={notificationError} unreadCount={unreadNotifications.length} reading={reading} onRead={(id) => void markRead([id])} onReadAll={() => void markRead(unreadNotifications.map((notification) => notification.id))} onRetry={() => void loadNotifications()} /> : null}
      {serverMode ? <NotificationPreferences preferences={preferences} loading={preferencesLoading} error={preferencesError} saving={preferenceSaving} onToggle={(kind, enabled) => void togglePreference(kind, enabled)} onRetry={() => void loadPreferences()} /> : null}
      {serverMode ? <MyReviews reviews={myReviews} addenda={reviewAddenda} drafts={addendumDrafts} loading={reviewsLoading} error={reviewsError} hidingId={hidingReviewId} savingAddendumFor={savingAddendumFor} onHide={(id) => void hideOwnReview(id)} onDraftChange={(id, body) => setAddendumDrafts((current) => ({ ...current, [id]: body }))} onSubmitAddendum={(id) => void submitAddendum(id)} onRetry={() => void loadMyReviews()} /> : null}
      {accountConfigured && accountAuthStatus !== "authenticated" ? <section className={styles.accountNotice}><strong>계정 알림을 준비하고 있어요.</strong><p>로그인한 계정에서만 개인 알림을 확인할 수 있습니다.</p><Link href="/login">로그인하기</Link></section> : null}

      {!accountConfigured ? <>

      <section className={styles.summaryGrid} aria-label="활동 요약">
        <SummaryCard icon={Bookmark} label="저장 기관" value={String(savedInstitutions.length) + "곳"} href="#saved-institutions" />
        <SummaryCard icon={Columns3} label="비교 담기" value={String(comparison.length) + "곳"} href="/compare" />
        <SummaryCard icon={BadgeCheck} label="인증 상태" value="체험용 2건" href="#verification-status" />
      </section>

      <section className={styles.card} aria-labelledby="draft-title">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <FilePenLine size={20} />
          </span>
          <div>
            <h2 id="draft-title">후기 초안</h2>
            <p>후기 작성 화면에서 입력한 내용은 이 기기에 자동 저장됩니다.</p>
          </div>
        </div>

        {hasDraft ? (
          <Link className={styles.draftCard} href="/review">
            <span>
              <strong>{draftInstitution?.name ?? "선택한 기관"}</strong>
              <small>
                {roleLabels[reviewDraft.relation]} 후기 · {reviewDraft.savedAt ? new Date(reviewDraft.savedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "저장일 없음"}
              </small>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        ) : (
          <div className={styles.emptyState}>
            <p>아직 저장된 후기 초안이 없어요.</p>
            <Link className={styles.primaryButton} href="/review">
              후기 쓰기 시작
            </Link>
          </div>
        )}
      </section>

      <section className={styles.card} id="saved-institutions" aria-labelledby="saved-title">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <Bookmark size={20} />
          </span>
          <div>
            <h2 id="saved-title">저장 기관</h2>
            <p>관심 기관 상세 화면으로 바로 이동할 수 있습니다.</p>
          </div>
        </div>

        {savedInstitutions.length > 0 ? (
          <div className={styles.savedList}>
            {savedInstitutions.map((institution) => (
              <InstitutionRow institution={institution} key={institution.id} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>저장한 기관이 아직 없어요. 기관을 둘러보고 관심 있는 곳을 담아보세요.</p>
            <Link className={styles.secondaryButton} href="/discover">
              기관 찾기
            </Link>
          </div>
        )}
      </section>

      <section className={styles.card} id="verification-status" aria-labelledby="verification-title">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon} aria-hidden="true">
            <BadgeCheck size={20} />
          </span>
          <div>
            <h2 id="verification-title">체험용 인증 상태</h2>
            <p>현재는 실제 서류 제출 없이 출시 전 흐름만 보여줍니다.</p>
          </div>
        </div>

        <div className={styles.verificationList}>
          {verificationItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link className={styles.verificationItem} href="/review" key={item.id}>
                <span className={styles.verificationIcon} aria-hidden="true">
                  <Icon size={19} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </span>
                <em>{item.status}</em>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.infoStrip}>
        <CheckCircle2 size={18} aria-hidden="true" />
        <p>체험 모드의 활동 정보는 서버로 전송되지 않고 브라우저 저장소에만 남습니다.</p>
      </section>
      </> : null}
    </main>
  );
}

function NotificationPreferences({ preferences, loading, error, saving, onToggle, onRetry }: { preferences: NotificationPreference[]; loading: boolean; error: string; saving: NotificationKind | null; onToggle: (kind: NotificationKind, enabled: boolean) => void; onRetry: () => void }) {
  return <section className={styles.preferenceCard} aria-labelledby="notification-preference-title">
    <div className={styles.preferenceHeader}>
      <span className={styles.sectionIcon} aria-hidden="true"><Settings2 size={20} /></span>
      <div><h2 id="notification-preference-title">알림 받기 설정</h2><p>필요한 소식만 골라 받을 수 있어요. 필수 보안 안내는 별도로 전달될 수 있습니다.</p></div>
    </div>
    {loading ? <p className={styles.notificationState} aria-busy="true">알림 설정을 불러오는 중이에요.</p> : null}
    {error ? <div className={styles.notificationError} role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
    {!loading && !error ? <div className={styles.preferenceList}>{preferences.map((preference) => {
      const label = notificationPreferenceLabels[preference.kind];
      return <label className={styles.preferenceItem} key={preference.kind}>
        <span><strong>{label.title}</strong><small>{label.helper}</small></span>
        <input type="checkbox" checked={preference.enabled} disabled={Boolean(saving)} onChange={(event) => onToggle(preference.kind, event.target.checked)} aria-label={`${label.title} 알림 ${preference.enabled ? "끄기" : "켜기"}`} />
      </label>;
    })}</div> : null}
  </section>;
}

function MyReviews({ reviews, addenda, drafts, loading, error, hidingId, savingAddendumFor, onHide, onDraftChange, onSubmitAddendum, onRetry }: { reviews: Array<{ id: string; institution_target_key: string; relation: UserRole; status: string; created_at: string; author_hidden_at: string | null }>; addenda: Array<{ id: string; review_id: string; body: string; status: string; created_at: string }>; drafts: Record<string, string>; loading: boolean; error: string; hidingId: string; savingAddendumFor: string; onHide: (id: string) => void; onDraftChange: (id: string, body: string) => void; onSubmitAddendum: (id: string) => void; onRetry: () => void }) {
  return <section className={styles.myReviewsCard} aria-labelledby="my-reviews-title"><div className={styles.myReviewsHeader}><div><h2 id="my-reviews-title">내 기관 후기</h2><p>내린 후기는 보관되며 공개 본문·집계·랭킹·공식 답변에서 제외됩니다.</p></div></div>{loading ? <p className={styles.notificationState} aria-busy="true">내 후기를 불러오는 중이에요.</p> : null}{error ? <div className={styles.notificationError} role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}{!loading && !error && reviews.length === 0 ? <p className={styles.notificationState}>작성한 기관 후기가 없어요.</p> : null}{!loading && !error && reviews.length ? <ul className={styles.myReviewsList}>{reviews.map((review) => <li key={review.id}><div><strong>{review.institution_target_key}</strong><span>{roleLabels[review.relation]} · {review.status} · {formatNotificationDate(review.created_at)}</span>{addenda.filter((addendum) => addendum.review_id === review.id).map((addendum) => <small key={addendum.id}>추가 설명 · {addendum.status} · {formatNotificationDate(addendum.created_at)}</small>)}{(review.status === "APPROVED" || review.status === "TEMPORARILY_HIDDEN") ? <div className={styles.addendumForm}><label>후기 추가 설명<textarea value={drafts[review.id] ?? ""} onChange={(event) => onDraftChange(review.id, event.target.value)} maxLength={1000} placeholder="원문은 유지되며, 추가 설명은 별도 심사를 거쳐 공개됩니다." /></label><button type="button" onClick={() => onSubmitAddendum(review.id)} disabled={savingAddendumFor === review.id || !(drafts[review.id] ?? "").trim()}>{savingAddendumFor === review.id ? "접수 중" : "추가 설명 접수"}</button></div> : null}</div>{review.author_hidden_at ? <em>내림 처리됨</em> : <button type="button" onClick={() => onHide(review.id)} disabled={hidingId === review.id}>{hidingId === review.id ? "내리는 중" : "내리기"}</button>}</li>)}</ul> : null}</section>;
}

function AccountNotifications({ notifications, loading, error, unreadCount, reading, onRead, onReadAll, onRetry }: { notifications: AccountNotification[]; loading: boolean; error: string; unreadCount: number; reading: boolean; onRead: (id: string) => void; onReadAll: () => void; onRetry: () => void }) {
  return <section className={styles.notificationCard} aria-labelledby="notification-title">
    <div className={styles.notificationHeader}>
      <span className={styles.sectionIcon} aria-hidden="true"><Bell size={20} /></span>
      <div><h2 id="notification-title">계정 알림</h2><p>읽지 않은 알림 {unreadCount}건</p></div>
      <button type="button" onClick={onReadAll} disabled={unreadCount === 0 || reading}><CheckCheck size={18} aria-hidden="true" /> 전체 읽음</button>
    </div>
    {loading ? <p className={styles.notificationState} aria-busy="true">알림을 불러오는 중이에요.</p> : null}
    {error ? <div className={styles.notificationError} role="alert"><p>{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div> : null}
    {!loading && !error && notifications.length === 0 ? <p className={styles.notificationState}>아직 계정 알림이 없어요.</p> : null}
    {!loading && !error && notifications.length > 0 ? <ul className={styles.notificationList}>{notifications.map((notification) => <li className={styles.notificationItem} data-unread={!notification.readAt} key={notification.id}><Link href={notification.linkPath || "/activity"}><strong>{notification.title}</strong><span>{notification.body}</span><small>{formatNotificationDate(notification.createdAt)}{notification.kind ? ` · ${notification.kind}` : ""}</small></Link>{!notification.readAt ? <button type="button" onClick={() => onRead(notification.id)} disabled={reading}>읽음</button> : <em>읽음</em>}</li>)}</ul> : null}
  </section>;
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link className={styles.summaryCard} href={href}>
      <span className={styles.summaryIcon} aria-hidden="true">
        <Icon size={20} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </Link>
  );
}

function InstitutionRow({ institution }: { institution: Institution }) {
  return (
    <Link className={styles.institutionRow} href={"/institutions/" + institution.id}>
      <span className={styles.institutionIcon} aria-hidden="true">
        <Building2 size={20} />
      </span>
      <span className={styles.institutionText}>
        <strong>{institution.name}</strong>
        <small>
          {institutionTypeLabels[institution.type]} · {institution.neighborhood} · {formatDistance(institution.distanceM)}
        </small>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </Link>
  );
}
