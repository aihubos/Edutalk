"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  Landmark,
  Link2,
  MapPin,
  Megaphone,
  Radio,
  UsersRound,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { roleLabels } from "@/lib/labels";
import type { UserRole } from "@/lib/types";
import type { PolicyCategory, PolicyItem, PolicyStatus } from "@/lib/policy-data";
import { policyItems } from "@/lib/policy-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import styles from "./policies.module.css";

type RoleFilter = UserRole | "ALL";
type CategoryFilter = PolicyCategory | "ALL";
type DeadlineFilter = PolicyStatus | "ALL";
type DisplayPolicyItem = Omit<PolicyItem, "isSynthetic"> & { isSynthetic: boolean };

const roleFilters: RoleFilter[] = ["ALL", "PARENT", "STUDENT", "TEACHER"];
const categoryFilters: CategoryFilter[] = ["ALL", "POLICY", "EVENT", "PROGRAM"];
const deadlineFilters: DeadlineFilter[] = ["ALL", "OPEN", "ONGOING", "CLOSED"];

const categoryLabels: Record<CategoryFilter, string> = {
  ALL: "전체",
  POLICY: "정책",
  EVENT: "행사",
  PROGRAM: "프로그램",
};

const statusLabels: Record<PolicyStatus, string> = {
  OPEN: "신청 가능",
  ONGOING: "진행중",
  CLOSED: "마감",
};

const categoryIcons: Record<PolicyCategory, LucideIcon> = {
  POLICY: Landmark,
  EVENT: Megaphone,
  PROGRAM: GraduationCap,
};

const getStatusTone = (status: PolicyStatus) => {
  if (status === "OPEN") return "open";
  if (status === "ONGOING") return "ongoing";
  return "closed";
};

const includesRole = (item: DisplayPolicyItem, roleFilter: RoleFilter) =>
  roleFilter === "ALL" || item.audienceRoles.includes(roleFilter);

export default function PoliciesPage() {
  const { role, setRole } = useApp();
  const configured = isSupabaseConfigured();
  const [accountItems, setAccountItems] = useState<DisplayPolicyItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(configured ? "loading" : "ready");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(role);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("ALL");

  useEffect(() => {
    if (!configured) return;
    void fetch("/api/policies").then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { mode?: string; items?: Array<Record<string, unknown>> };
      if (!response.ok || payload.mode !== "supabase") { setLoadState("error"); return; }
      setAccountItems((payload.items ?? []).map((item) => ({
        id: String(item.id), title: String(item.title ?? ""), summary: String(item.summary ?? ""), audienceRoles: Array.isArray(item.audience_roles) ? item.audience_roles.filter((role): role is UserRole => role === "PARENT" || role === "STUDENT" || role === "TEACHER") : [], category: item.category === "EVENT" || item.category === "PROGRAM" ? item.category : "POLICY", organizer: String(item.organizer ?? ""), applicationPeriod: String(item.application_period ?? ""), status: item.status === "OPEN" || item.status === "CLOSED" ? item.status : "ONGOING", region: String(item.region ?? ""), sourceUrl: String(item.source_url ?? ""), sourceLabel: String(item.source_label ?? ""), sourceDate: String(item.source_date ?? ""), isSynthetic: false,
      })));
      setLoadState("ready");
    }).catch(() => setLoadState("error"));
  }, [configured]);

  const items = configured ? accountItems : policyItems;
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const roleMatched = includesRole(item, roleFilter);
        const categoryMatched = categoryFilter === "ALL" || item.category === categoryFilter;
        const deadlineMatched = deadlineFilter === "ALL" || item.status === deadlineFilter;

        return roleMatched && categoryMatched && deadlineMatched;
      }),
    [categoryFilter, deadlineFilter, items, roleFilter],
  );

  const openCount = items.filter((item) => item.status === "OPEN").length;
  const ongoingCount = items.filter((item) => item.status === "ONGOING").length;
  const waitingCount = items.filter((item) => item.status === "CLOSED").length;

  const handleRoleFilter = (nextRole: RoleFilter) => {
    setRoleFilter(nextRole);
    if (nextRole !== "ALL") setRole(nextRole);
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="policies-title">
        <div className={styles.heroCopy}>
          <span className={styles.demoBadge}>{configured ? "계정 운영 데이터" : "체험용 데이터 · 큐레이션 샘플"}</span>
          <p className={styles.eyebrow}>국가정책 · 경기교육 · 화성동탄 행사</p>
          <h1 id="policies-title">내 역할에 맞는 교육 지원 정보를 모아봤어요</h1>
          <p>
            {configured ? "운영자가 적재한 공개 정책·행사 데이터만 표시합니다. 신청 전 원문을 꼭 확인하세요." : "공식 원문을 바탕으로 이 화면에서 체험용으로 요약한 목록입니다. 실제 최신 자동동기화가 아니므로 신청 전 원문을 꼭 확인하세요."}
          </p>
        </div>

        <div className={styles.statusGrid} aria-label="정책 상태 요약">
          <div>
            <CheckCircle2 size={19} aria-hidden="true" />
            <span>신청 가능</span>
            <strong>{openCount}건</strong>
          </div>
          <div>
            <Radio size={19} aria-hidden="true" />
            <span>진행중</span>
            <strong>{ongoingCount}건</strong>
          </div>
          <div>
            <Link2 size={19} aria-hidden="true" />
            <span>마감/연결대기</span>
            <strong>{waitingCount}건</strong>
          </div>
        </div>
      </section>

      <section className={styles.filterPanel} aria-labelledby="filter-title">
        <div className={styles.filterTitle}>
          <Filter size={18} aria-hidden="true" />
          <h2 id="filter-title">보기 조건</h2>
        </div>

        <div className={styles.filterGroup} aria-label="역할 필터">
          {roleFilters.map((item) => (
            <button
              key={item}
              type="button"
              data-active={roleFilter === item}
              onClick={() => handleRoleFilter(item)}
            >
              {item === "ALL" ? "전체 역할" : roleLabels[item]}
            </button>
          ))}
        </div>

        <div className={styles.filterGroup} aria-label="카테고리 필터">
          {categoryFilters.map((item) => (
            <button
              key={item}
              type="button"
              data-active={categoryFilter === item}
              onClick={() => setCategoryFilter(item)}
            >
              {categoryLabels[item]}
            </button>
          ))}
        </div>

        <div className={styles.filterGroup} aria-label="마감 상태 필터">
          {deadlineFilters.map((item) => (
            <button
              key={item}
              type="button"
              data-active={deadlineFilter === item}
              onClick={() => setDeadlineFilter(item)}
            >
              {item === "ALL" ? "전체 상태" : statusLabels[item]}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.listSection} aria-labelledby="result-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>맞춤 목록</p>
            <h2 id="result-title">{visibleItems.length}건을 찾았어요</h2>
          </div>
          <span>원문 확인 필수</span>
        </div>

        {loadState === "loading" ? <div className={styles.emptyState} role="status"><FileText size={30} aria-hidden="true" /><h3>공개 정책·행사 데이터를 불러오는 중이에요</h3><p>운영자가 적재한 최신 공개 항목을 확인하고 있습니다.</p></div> : visibleItems.length > 0 ? (
          <div className={styles.cardList}>
            {visibleItems.map((item) => {
              const CategoryIcon = categoryIcons[item.category];

              return (
                <article key={item.id} className={styles.policyCard}>
                  <div className={styles.cardTop}>
                    <div className={styles.iconWrap} aria-hidden="true">
                      <CategoryIcon size={22} />
                    </div>

                    <div className={styles.cardTitle}>
                      <div className={styles.badgeRow}>
                        <span>{categoryLabels[item.category]}</span>
                        <span data-tone={getStatusTone(item.status)}>{statusLabels[item.status]}</span>
                        <span>{configured ? "운영 적재" : "수동 큐레이션"}</span>
                      </div>
                      <h3>{item.title}</h3>
                    </div>
                  </div>

                  <p className={styles.summary}>{item.summary}</p>

                  <dl className={styles.metaGrid}>
                    <div>
                      <dt>
                        <UsersRound size={14} aria-hidden="true" />
                        대상
                      </dt>
                      <dd>{item.audienceRoles.map((targetRole) => roleLabels[targetRole]).join(", ")}</dd>
                    </div>
                    <div>
                      <dt>
                        <Landmark size={14} aria-hidden="true" />
                        주최
                      </dt>
                      <dd>{item.organizer}</dd>
                    </div>
                    <div>
                      <dt>
                        <CalendarDays size={14} aria-hidden="true" />
                        신청기간
                      </dt>
                      <dd>{item.applicationPeriod}</dd>
                    </div>
                    <div>
                      <dt>
                        <MapPin size={14} aria-hidden="true" />
                        지역
                      </dt>
                      <dd>{item.region}</dd>
                    </div>
                    <div>
                      <dt>
                        <FileText size={14} aria-hidden="true" />
                        출처
                      </dt>
                      <dd>
                        {item.sourceLabel} · {item.sourceDate}
                      </dd>
                    </div>
                  </dl>

                  <a className={styles.sourceLink} href={item.sourceUrl} target="_blank" rel="noreferrer">
                    공식 원문 보기
                    <ExternalLink size={16} aria-hidden="true" />
                  </a>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <FileText size={30} aria-hidden="true" />
            <h3>{loadState === "error" ? "공개 정책·행사 데이터를 불러오지 못했어요" : "공개로 적재된 항목이 없어요"}</h3>
            <p>{loadState === "error" ? "잠시 후 다시 확인해 주세요." : configured ? "운영자가 공개 항목을 적재하면 역할과 상태별로 이 화면에 표시됩니다." : "역할, 카테고리, 마감 상태를 전체로 바꿔 다시 확인해보세요."}</p>
          </div>
        )}
      </section>
    </main>
  );
}
