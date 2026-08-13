"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  AccountAuthStatus,
  AppContextValue,
  AppState,
  AgeBand,
  Assessment,
  GrowthRecord,
  InstitutionExperienceReview,
  ReviewDraft,
  RoleProfile,
  SchoolRecordDraft,
  ServiceZone,
  StudentJournal,
  Student,
  SubjectScore,
  SubscriptionPlan,
  TutorJob,
  TutorProfile,
  TutorReview,
  UserRole,
} from "@/lib/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { trackProductEvent } from "@/lib/product-events";

const STORAGE_KEY = "edutalk-app-state-v1";

const emptyDraft: ReviewDraft = {
  institutionId: "",
  relation: "PARENT",
  scores: {},
  strength: "",
  improvement: "",
  recommendTo: "",
  verificationAcknowledged: false,
  savedAt: null,
};

const initialState: AppState = {
  role: "PARENT",
  roles: ["PARENT"],
  zone: "DONGTAN_2",
  favorites: [],
  comparison: [],
  reviewDraft: emptyDraft,
  institutionReviews: [],
  onboardingComplete: false,
  ageBand: null,
  consentVersion: null,
  consentedAt: null,
  roleProfile: null,
  customStudents: [],
  customAssessments: [],
  customScores: [],
  customGrowthRecords: [],
  studentJournals: [],
  schoolRecordDrafts: [],
  tutorProfiles: [],
  tutorJobs: [],
  tutorReviews: [],
  aiUsage: {
    plan: "FREE",
    freeLimit: 10,
    used: 0,
    subscriptionStatus: "INACTIVE",
  },
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const accountConfigured = isSupabaseConfigured();
  const [accountAuthStatus, setAccountAuthStatus] = useState<AccountAuthStatus>(
    accountConfigured ? "checking" : "disabled",
  );

  /* eslint-disable react-hooks/set-state-in-effect -- 서버 렌더와 첫 화면을 동일하게 유지한 뒤, 마운트 후 저장소 또는 계정 프로필을 복원한다. */
  useEffect(() => {
    let active = true;

    if (accountConfigured) {
      const client = createBrowserSupabaseClient();
      if (!client) {
        setState(initialState);
        setAccountAuthStatus("anonymous");
        setHydrated(true);
        return;
      }

      const restoreAccount = async () => {
        setAccountAuthStatus("checking");
        const { data: claimsData, error: claimsError } = await client.auth.getClaims();
        const userId = claimsData?.claims?.sub;

        if (!active) return;
        if (claimsError || typeof userId !== "string") {
          setState(initialState);
          setAccountAuthStatus("anonymous");
          setHydrated(true);
          return;
        }

        const [consentResult, rolesResult, profilesResult, accountProfileResult, usageResult, favoritesResult, comparisonsResult] = await Promise.all([
          client.from("user_consents").select("age_band, terms_version, consented_at").eq("user_id", userId).maybeSingle(),
          client.from("user_roles").select("role, created_at").eq("user_id", userId).order("created_at", { ascending: true }),
          client.from("user_role_profiles").select("role, fields, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }),
          client.from("profiles").select("active_role").eq("user_id", userId).maybeSingle(),
          client.from("ai_usage_accounts").select("plan, free_limit, used_count, subscription_active, current_period_end").eq("user_id", userId).maybeSingle(),
          fetch("/api/favorites").then(async (response) => {
            const payload = await response.json().catch(() => null) as { favorites?: unknown[] } | null;
            return response.ok && Array.isArray(payload?.favorites)
              ? payload.favorites.filter((item): item is string => typeof item === "string")
              : [] as string[];
          }).catch((): string[] => []),
          fetch("/api/comparisons").then(async (response) => {
            const payload = await response.json().catch(() => null) as { comparisons?: unknown[] } | null;
            return response.ok && Array.isArray(payload?.comparisons)
              ? payload.comparisons.filter((item): item is string => typeof item === "string")
              : [] as string[];
          }).catch((): string[] => []),
        ]);

        if (!active) return;

        const roles = (rolesResult.data ?? [])
          .map((item) => item.role)
          .filter((item): item is UserRole => item === "PARENT" || item === "STUDENT" || item === "TEACHER");
        const storedActiveRole = accountProfileResult.data?.active_role;
        const selectedRole = roles.includes(storedActiveRole as UserRole)
          ? storedActiveRole as UserRole
          : (profilesResult.data ?? []).find((item) => roles.includes(item.role as UserRole))?.role as UserRole | undefined;
        const selectedProfile = (profilesResult.data ?? []).find((item) => item.role === selectedRole);
        const rawFields = selectedProfile?.fields;
        const fields = rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)
          ? Object.fromEntries(Object.entries(rawFields).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : {};
        const serviceZone = fields.serviceZone;
        const restoredZone: ServiceZone = serviceZone === "ALL" || serviceZone === "DONGTAN_1" || serviceZone === "DONGTAN_2"
          ? serviceZone
          : initialState.zone;
        const age = consentResult.data?.age_band;
        const restoredAge: AgeBand | null = age === "UNDER_14" || age === "FOURTEEN_PLUS" || age === "ADULT" ? age : null;
        const onboardingComplete = Boolean(consentResult.data && selectedRole && roles.includes(selectedRole));
        const usage = usageResult.data;
        const periodActive = !usage?.current_period_end || new Date(usage.current_period_end).getTime() > Date.now();

        setState({
          ...initialState,
          role: selectedRole ?? initialState.role,
          roles: roles.length > 0 ? roles : initialState.roles,
          zone: restoredZone,
          onboardingComplete,
          ageBand: restoredAge,
          consentVersion: consentResult.data?.terms_version ?? null,
          consentedAt: consentResult.data?.consented_at ?? null,
          roleProfile: selectedRole ? { role: selectedRole, fields } : null,
          favorites: favoritesResult,
          comparison: comparisonsResult,
          aiUsage: {
            plan: usage?.plan === "UNLIMITED" ? "UNLIMITED" : "FREE",
            freeLimit: 10,
            used: typeof usage?.used_count === "number" ? usage.used_count : 0,
            subscriptionStatus: usage?.subscription_active && periodActive ? "ACTIVE" : "INACTIVE",
          },
        });
        setAccountAuthStatus("authenticated");
        setHydrated(true);
      };

      void restoreAccount();
      const { data: listener } = client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          setState(initialState);
          setAccountAuthStatus("anonymous");
          setHydrated(true);
          return;
        }
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          window.setTimeout(() => void restoreAccount(), 0);
        }
      });

      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    }

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AppState>;
        const isUnder14 = parsed.ageBand === "UNDER_14";
        const restoredRoles = isUnder14
          ? [...new Set([...(parsed.roles ?? []), "PARENT" as const])].filter((role) => role !== "STUDENT")
          : parsed.roles ?? initialState.roles;
        const restoredRole = isUnder14 && parsed.role === "STUDENT" ? "PARENT" : parsed.role ?? initialState.role;
        setState({
          ...initialState,
          ...parsed,
          role: restoredRole,
          roles: restoredRoles,
          reviewDraft: { ...emptyDraft, ...parsed.reviewDraft },
          institutionReviews: parsed.institutionReviews ?? [],
          ageBand: parsed.ageBand ?? null,
          consentVersion: parsed.consentVersion ?? null,
          consentedAt: parsed.consentedAt ?? null,
          roleProfile: parsed.roleProfile ?? null,
          aiUsage: { ...initialState.aiUsage, ...parsed.aiUsage },
          customStudents: parsed.customStudents ?? [],
          customAssessments: parsed.customAssessments ?? [],
          customScores: parsed.customScores ?? [],
          customGrowthRecords: parsed.customGrowthRecords ?? [],
          studentJournals: parsed.studentJournals ?? [],
          schoolRecordDrafts: parsed.schoolRecordDrafts ?? [],
          tutorProfiles: parsed.tutorProfiles ?? [],
          tutorJobs: parsed.tutorJobs ?? [],
          tutorReviews: parsed.tutorReviews ?? [],
        });
      }
    } catch {
      // 브라우저 저장소를 사용할 수 없어도 앱은 메모리 상태로 동작한다.
    } finally {
      setAccountAuthStatus("disabled");
      setHydrated(true);
    }
    return () => {
      active = false;
    };
  }, [accountConfigured]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated || accountConfigured) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장 실패는 현재 세션 사용을 막지 않는다.
    }
  }, [accountConfigured, hydrated, state]);

  const setRole = useCallback((role: UserRole) => {
    const previousRole = state.role;
    const previousRoleProfile = state.roleProfile;
    const requestedRole = role === "STUDENT" && state.ageBand === "UNDER_14" ? "PARENT" : role;
    if (accountConfigured && accountAuthStatus === "authenticated" && !state.roles.includes(requestedRole)) return;
    const nextRole = requestedRole;
    setState((current) => ({
      ...current,
      role: nextRole,
      roles: accountConfigured && accountAuthStatus === "authenticated"
        ? current.roles
        : current.roles.includes(requestedRole) ? current.roles : [...current.roles, requestedRole],
      roleProfile: current.roleProfile?.role === nextRole ? current.roleProfile : null,
      reviewDraft: { ...current.reviewDraft, relation: nextRole },
    }));
    if (accountConfigured && accountAuthStatus === "authenticated") {
      if (nextRole === previousRole) return;
      void fetch("/api/account-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "ROLE", role: nextRole }) })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as { error?: string; fields?: unknown } | null;
          if (!response.ok) throw new Error(payload?.error ?? "역할 전환을 저장하지 못했어요.");
          const rawFields = payload?.fields;
          const fields = rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)
            ? Object.fromEntries(Object.entries(rawFields).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
            : {};
          const serviceZone = fields.serviceZone;
          const nextZone: ServiceZone | null = serviceZone === "ALL" || serviceZone === "DONGTAN_1" || serviceZone === "DONGTAN_2" ? serviceZone : null;
          setState((current) => current.role === nextRole ? { ...current, zone: nextZone ?? current.zone, roleProfile: { role: nextRole, fields } } : current);
        })
        .catch((error) => {
          setState((current) => current.role === nextRole ? { ...current, role: previousRole, roleProfile: previousRoleProfile, reviewDraft: { ...current.reviewDraft, relation: previousRole } } : current);
          window.dispatchEvent(new CustomEvent("edutalk:preference-error", { detail: error instanceof Error ? error.message : "역할 전환을 저장하지 못했어요." }));
        });
    }
  }, [accountAuthStatus, accountConfigured, state.ageBand, state.role, state.roleProfile, state.roles]);

  const addRole = useCallback((role: UserRole) => {
    setState((current) => ({
      ...current,
      roles: accountConfigured && accountAuthStatus === "authenticated"
        ? current.roles
        : role === "STUDENT" && current.ageBand === "UNDER_14"
        ? current.roles
        : current.roles.includes(role) ? current.roles : [...current.roles, role],
    }));
  }, [accountAuthStatus, accountConfigured]);

  const setZone = useCallback((zone: ServiceZone) => {
    const previousZone = state.zone;
    setState((current) => ({ ...current, zone, roleProfile: current.roleProfile ? { ...current.roleProfile, fields: { ...current.roleProfile.fields, serviceZone: zone } } : null }));
    if (accountConfigured && accountAuthStatus === "authenticated") {
      void fetch("/api/account-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "ZONE", zone }) })
        .then(async (response) => {
          if (response.ok) return;
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          setState((current) => ({ ...current, zone: previousZone, roleProfile: current.roleProfile ? { ...current.roleProfile, fields: { ...current.roleProfile.fields, serviceZone: previousZone } } : null }));
          window.dispatchEvent(new CustomEvent("edutalk:preference-error", { detail: payload?.error ?? "관심 지역을 저장하지 못했어요." }));
        })
        .catch(() => {
          setState((current) => ({ ...current, zone: previousZone, roleProfile: current.roleProfile ? { ...current.roleProfile, fields: { ...current.roleProfile.fields, serviceZone: previousZone } } : null }));
          window.dispatchEvent(new CustomEvent("edutalk:preference-error", { detail: "관심 지역을 저장하지 못했어요." }));
        });
    }
  }, [accountAuthStatus, accountConfigured, state.zone]);

  const updateRoleProfile = useCallback(async (fields: Record<string, string>) => {
    const currentProfile = state.roleProfile;
    if (!currentProfile || currentProfile.role !== state.role) return { ok: false, error: "현재 역할의 추천 프로필을 먼저 설정해 주세요." };
    const nextFields = { ...currentProfile.fields, ...fields };
    if (accountConfigured) {
      if (accountAuthStatus !== "authenticated") return { ok: false, error: "로그인한 계정에서 추천 프로필을 저장할 수 있어요." };
      try {
        const response = await fetch("/api/account-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "PROFILE", fields }) });
        const payload = await response.json().catch(() => null) as { error?: string; fields?: unknown } | null;
        if (!response.ok) return { ok: false, error: payload?.error ?? "추천 프로필을 저장하지 못했어요." };
        const savedFields = payload?.fields && typeof payload.fields === "object" && !Array.isArray(payload.fields)
          ? Object.fromEntries(Object.entries(payload.fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : nextFields;
        setState((current) => current.role === currentProfile.role ? { ...current, roleProfile: { role: currentProfile.role, fields: savedFields } } : current);
        return { ok: true };
      } catch {
        return { ok: false, error: "추천 프로필을 저장하지 못했어요." };
      }
    }
    setState((current) => current.role === currentProfile.role ? { ...current, roleProfile: { role: currentProfile.role, fields: nextFields } } : current);
    return { ok: true };
  }, [accountAuthStatus, accountConfigured, state.role, state.roleProfile]);

  const toggleFavorite = useCallback((id: string) => {
    const wasFavorite = state.favorites.includes(id);
    setState((current) => ({
      ...current,
      favorites: wasFavorite
        ? current.favorites.filter((item) => item !== id)
        : [...current.favorites, id],
    }));
    if (!accountConfigured || accountAuthStatus !== "authenticated") return;
    void fetch("/api/favorites", { method: wasFavorite ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetKey: id }) })
      .then(async (response) => {
        if (response.ok) {
          if (!wasFavorite) trackProductEvent({ eventName: "FAVORITE_ADDED", path: "/discover", category: "institution", role: state.role });
          return;
        }
        setState((current) => ({ ...current, favorites: wasFavorite ? [...new Set([...current.favorites, id])] : current.favorites.filter((item) => item !== id) }));
        window.dispatchEvent(new CustomEvent("edutalk:favorites-error", { detail: "관심 기관 저장에 실패해 이전 상태로 되돌렸어요." }));
      })
      .catch(() => {
        setState((current) => ({ ...current, favorites: wasFavorite ? [...new Set([...current.favorites, id])] : current.favorites.filter((item) => item !== id) }));
        window.dispatchEvent(new CustomEvent("edutalk:favorites-error", { detail: "관심 기관 저장에 실패해 이전 상태로 되돌렸어요." }));
      });
  }, [accountAuthStatus, accountConfigured, state.favorites, state.role]);

  const toggleComparison = useCallback((id: string) => {
    if (!state.comparison.includes(id) && state.comparison.length >= 3) {
      return { ok: false, reason: "비교는 최대 3곳까지 담을 수 있어요." };
    }

    const nextComparison = state.comparison.includes(id)
      ? state.comparison.filter((item) => item !== id)
      : [...state.comparison, id];
    setState((current) => ({ ...current, comparison: nextComparison }));
    if (accountConfigured && accountAuthStatus === "authenticated") {
      const wasCompared = state.comparison.includes(id);
      void fetch("/api/comparisons", { method: wasCompared ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetKey: id }) })
        .then(async (response) => {
          if (response.ok) {
            if (!wasCompared) trackProductEvent({ eventName: "COMPARISON_CREATED", path: "/compare", category: "institution", role: state.role });
            return;
          }
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          setState((current) => ({ ...current, comparison: wasCompared ? [...new Set([...current.comparison, id])] : current.comparison.filter((item) => item !== id) }));
          window.dispatchEvent(new CustomEvent("edutalk:comparison-error", { detail: payload?.error ?? "비교 목록 저장에 실패해 이전 상태로 되돌렸어요." }));
        })
        .catch(() => {
          setState((current) => ({ ...current, comparison: wasCompared ? [...new Set([...current.comparison, id])] : current.comparison.filter((item) => item !== id) }));
          window.dispatchEvent(new CustomEvent("edutalk:comparison-error", { detail: "비교 목록 저장에 실패해 이전 상태로 되돌렸어요." }));
        });
    }
    return { ok: true };
  }, [accountAuthStatus, accountConfigured, state.comparison, state.role]);

  const updateReviewDraft = useCallback((patch: Partial<ReviewDraft>) => {
    setState((current) => ({
      ...current,
      reviewDraft: { ...current.reviewDraft, ...patch, savedAt: new Date().toISOString() },
    }));
  }, []);

  const clearReviewDraft = useCallback(() => {
    setState((current) => ({ ...current, reviewDraft: { ...emptyDraft, relation: current.role } }));
  }, []);

  const addInstitutionReview = useCallback((review: InstitutionExperienceReview) => {
    setState((current) => ({
      ...current,
      institutionReviews: [review, ...current.institutionReviews],
    }));
  }, []);

  const completeOnboarding = useCallback(async (settings: { ageBand: AgeBand; consentVersions: { terms: string; privacy: string; community: string }; consentedAt: string; roleProfile: RoleProfile; role: UserRole; zone: ServiceZone }) => {
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = (await response.json().catch(() => null)) as { mode?: "demo" | "supabase"; ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) return { ok: false, error: result?.error ?? "설정을 저장하지 못했어요. 다시 시도해 주세요." };
    } catch {
      return { ok: false, error: "설정을 저장하지 못했어요. 다시 시도해 주세요." };
    }
    setState((current) => ({
      ...current,
      role: settings.role,
      roles: current.onboardingComplete
        ? current.roles.includes(settings.role) ? current.roles : [...current.roles, settings.role]
        : [settings.role],
      zone: settings.zone,
      onboardingComplete: true,
      ageBand: settings.ageBand,
      consentVersion: settings.consentVersions.terms,
      consentedAt: settings.consentedAt,
      roleProfile: settings.roleProfile,
      reviewDraft: { ...current.reviewDraft, relation: settings.role },
    }));
    trackProductEvent({ eventName: "ROLE_SELECTED", path: "/onboarding", category: "primary", role: settings.role });
    trackProductEvent({ eventName: "LOCATION_SELECTED", path: "/onboarding", category: settings.zone, role: settings.role });
    trackProductEvent({ eventName: "ONBOARDING_COMPLETED", path: "/onboarding", category: "complete", role: settings.role });
    return { ok: true };
  }, []);

  const addStudent = useCallback((student: Student) => {
    setState((current) => ({ ...current, customStudents: [...current.customStudents, student] }));
  }, []);

  const addAssessment = useCallback((assessment: Assessment) => {
    setState((current) => ({ ...current, customAssessments: [...current.customAssessments, assessment] }));
  }, []);

  const addSubjectScore = useCallback((score: SubjectScore) => {
    setState((current) => ({ ...current, customScores: [...current.customScores, score] }));
  }, []);

  const addGrowthRecord = useCallback((record: GrowthRecord) => {
    setState((current) => ({ ...current, customGrowthRecords: [...current.customGrowthRecords, record] }));
  }, []);

  const addStudentJournal = useCallback((journal: StudentJournal) => {
    setState((current) => ({ ...current, studentJournals: [journal, ...current.studentJournals] }));
  }, []);

  const addSchoolRecordDraft = useCallback((draft: SchoolRecordDraft) => {
    setState((current) => ({ ...current, schoolRecordDrafts: [draft, ...current.schoolRecordDrafts] }));
  }, []);

  const addTutorProfile = useCallback((profile: TutorProfile) => {
    setState((current) => ({ ...current, tutorProfiles: [profile, ...current.tutorProfiles] }));
  }, []);

  const addTutorJob = useCallback((job: TutorJob) => {
    setState((current) => ({ ...current, tutorJobs: [job, ...current.tutorJobs] }));
  }, []);

  const addTutorReview = useCallback((review: TutorReview) => {
    setState((current) => ({ ...current, tutorReviews: [review, ...current.tutorReviews] }));
  }, []);

  const consumeAiCredit = useCallback(() => {
    if (state.aiUsage.plan === "UNLIMITED" && state.aiUsage.subscriptionStatus === "ACTIVE") {
      return { ok: true, remaining: Number.POSITIVE_INFINITY };
    }

    const remaining = Math.max(0, state.aiUsage.freeLimit - state.aiUsage.used);
    if (remaining === 0) return { ok: false, remaining: 0 };

    const used = state.aiUsage.used + 1;
    setState((current) => ({ ...current, aiUsage: { ...current.aiUsage, used } }));
    return { ok: true, remaining: state.aiUsage.freeLimit - used };
  }, [state.aiUsage]);

  const applyServerAiUsage = useCallback((remaining: number | null, plan?: SubscriptionPlan) => {
    setState((current) => ({
      ...current,
      aiUsage: {
        ...current.aiUsage,
        plan: plan ?? current.aiUsage.plan,
        used: typeof remaining === "number" && remaining >= 0
          ? Math.max(0, current.aiUsage.freeLimit - remaining)
          : current.aiUsage.used,
        subscriptionStatus: plan === "UNLIMITED" ? "ACTIVE" : current.aiUsage.subscriptionStatus,
      },
    }));
  }, []);

  const setSubscriptionPlan = useCallback((plan: SubscriptionPlan) => {
    setState((current) => ({
      ...current,
      aiUsage: {
        ...current.aiUsage,
        plan,
        subscriptionStatus: plan === "UNLIMITED" ? "ACTIVE" : "INACTIVE",
      },
    }));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      hydrated,
      accountAuthStatus,
      setRole,
      addRole,
      setZone,
      updateRoleProfile,
      toggleFavorite,
      toggleComparison,
      updateReviewDraft,
      clearReviewDraft,
      addInstitutionReview,
      completeOnboarding,
      addStudent,
      addAssessment,
      addSubjectScore,
      addGrowthRecord,
      addStudentJournal,
      addSchoolRecordDraft,
      addTutorProfile,
      addTutorJob,
      addTutorReview,
      consumeAiCredit,
      applyServerAiUsage,
      setSubscriptionPlan,
    }),
    [
      state,
      hydrated,
      accountAuthStatus,
      setRole,
      addRole,
      setZone,
      updateRoleProfile,
      toggleFavorite,
      toggleComparison,
      updateReviewDraft,
      clearReviewDraft,
      addInstitutionReview,
      completeOnboarding,
      addStudent,
      addAssessment,
      addSubjectScore,
      addGrowthRecord,
      addStudentJournal,
      addSchoolRecordDraft,
      addTutorProfile,
      addTutorJob,
      addTutorReview,
      consumeAiCredit,
      applyServerAiUsage,
      setSubscriptionPlan,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
