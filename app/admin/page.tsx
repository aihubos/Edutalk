"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  CopyCheck,
  Database,
  FileClock,
  FileWarning,
  Flag,
  MapPinned,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { institutions } from "@/lib/demo-data";
import {
  correctionIssueLabels,
  emptyOperationsState,
  operationStatusLabels,
  operationsStorageKey,
  independentTutorTargetId,
  reportIssueLabels,
  verificationEvidenceLabels,
  verificationKindLabels,
  type OperationsState,
  type OperationStatus,
  type VerificationRequest,
} from "@/lib/operations-data";
import { roleLabels } from "@/lib/labels";
import { ServerAdminConsole } from "@/components/server-admin-console";
import { ServerDataOperations } from "@/components/server-data-operations";
import { ServerFeatureFlags } from "@/components/server-feature-flags";
import { ServerObservability } from "@/components/server-observability";
import { ServerPublicInformationManager } from "@/components/server-public-information-manager";
import { ServerInstitutionDetailManager } from "@/components/server-institution-detail-manager";
import { ServerRuntimeStatus } from "@/components/server-runtime-status";
import styles from "./admin.module.css";

interface OperationMetric {
  title: string;
  count: string;
  helper: string;
  icon: LucideIcon;
  tone: "primary" | "warning" | "danger" | "success";
}

interface ReadinessItem {
  title: string;
  status: string;
  helper: string;
  icon: LucideIcon;
}

const releaseGateReady = [
  "전체 핵심 화면 UI와 설치형 PWA",
  "브라우저 기반 demo 흐름",
  "Supabase DB 마이그레이션 기반",
  "공공데이터 ETL dry-run",
];

const releaseGateRequired = [
  "Supabase 프로젝트, Auth, 비공개 Storage",
  "공공데이터 API 승인과 실제 연결",
  "Google, Kakao, Naver OAuth 설정",
  "결제사 웹훅과 실제 구독 권한 판정",
  "정식 약관, 개인정보처리방침, 고객센터",
  "2주 비공개 베타 운영",
];

const pendingVerification = institutions.filter((institution) => !institution.verified).length;
const supplementWaiting = institutions.filter((institution) => institution.feeSource === "UNCONFIRMED").length;
const missingCoordinates = institutions.filter((institution) => !institution.coordinates).length;
const reviewSampleCount = institutions.reduce((sum, institution) => sum + institution.reviewHighlights.length, 0);

const operationMetrics: OperationMetric[] = [
  {
    title: "미처리 인증",
    count: `체험 ${pendingVerification}건`,
    helper: "기관 인증 또는 이용자 인증을 아직 검토하지 않은 상태입니다.",
    icon: ShieldCheck,
    tone: "primary",
  },
  {
    title: "보완 대기",
    count: `체험 ${supplementWaiting}건`,
    helper: "비용, 서류, 출처가 부족해 추가 확인이 필요한 항목입니다.",
    icon: FileClock,
    tone: "warning",
  },
  {
    title: "후기 검수",
    count: `체험 ${reviewSampleCount}건`,
    helper: "샘플 후기 문구가 역할별 노출 기준에 맞는지 확인하는 큐입니다.",
    icon: FileWarning,
    tone: "primary",
  },
  {
    title: "신고",
    count: "체험 0건",
    helper: "욕설, 개인정보, 허위 정보 신고 접수 영역입니다.",
    icon: Flag,
    tone: "danger",
  },
  {
    title: "삭제 예정",
    count: "체험 0건",
    helper: "운영자 확인 뒤 비공개 또는 삭제될 콘텐츠를 모읍니다.",
    icon: Trash2,
    tone: "danger",
  },
  {
    title: "동기화 오류",
    count: "체험 1건",
    helper: "공개자료 갱신, 기관 정보 반영 실패를 추적하는 카드입니다.",
    icon: RefreshCcw,
    tone: "warning",
  },
  {
    title: "중복 후보",
    count: "체험 2건",
    helper: "이름, 주소, 전화번호가 비슷한 기관을 병합 후보로 표시합니다.",
    icon: CopyCheck,
    tone: "primary",
  },
  {
    title: "좌표 누락",
    count: `체험 ${missingCoordinates}건`,
    helper: "지도 표시 전 주소와 좌표 연결이 필요한 항목입니다.",
    icon: MapPinned,
    tone: "success",
  },
];

const readinessItems: ReadinessItem[] = [
  {
    title: "공공 데이터 연결",
    status: "준비 중",
    helper: "어린이집, 유치원, 학원 공개자료를 정기 반영할 수 있게 연결 예정입니다.",
    icon: Database,
  },
  {
    title: "인증 자료 보관",
    status: "미연결",
    helper: "민감 자료는 실제 저장소와 권한 정책이 확정된 뒤 연결합니다.",
    icon: ShieldCheck,
  },
  {
    title: "알림 발송",
    status: "미연결",
    helper: "검수 결과와 보완 요청 알림은 문자 또는 앱 알림으로 분리 예정입니다.",
    icon: Bell,
  },
  {
    title: "기관 정정 요청",
    status: "화면 준비",
    helper: "기관 담당자가 운영시간, 비용, 연락처 정정을 요청하는 흐름입니다.",
    icon: Building2,
  },
];

export default function AdminPage() {
  const isProduction = process.env.NEXT_PUBLIC_DATA_MODE === "production";
  const [operations, setOperations] = useState<OperationsState>(emptyOperationsState);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect -- 서버 첫 화면 뒤 브라우저의 체험 운영 큐를 한 번 복원한다. */
  useEffect(() => {
    if (isProduction) return;
    try {
      const saved = window.localStorage.getItem(operationsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OperationsState>;
        setOperations({
          verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [],
          corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
          reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        });
      }
    } catch {
      setNotice("체험 요청을 불러오지 못했어요. 새로 접수한 요청부터 표시합니다.");
    } finally {
      setHydrated(true);
    }
  }, [isProduction]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (isProduction || !hydrated) return;
    try {
      window.localStorage.setItem(operationsStorageKey, JSON.stringify(operations));
    } catch {}
  }, [hydrated, isProduction, operations]);

  const queueCount = useMemo(
    () => operations.verifications.length + operations.corrections.length + operations.reports.length,
    [operations],
  );
  const institutionName = (id: string) => id === independentTutorTargetId ? "개인 튜터" : institutions.find((institution) => institution.id === id)?.name ?? "선택한 기관";
  const updateStatus = (queue: keyof OperationsState, id: string, status: Exclude<OperationStatus, "PENDING">) => {
    const now = new Date().toISOString();
    setOperations((current) => ({
      ...current,
      [queue]: current[queue].map((item) => {
        if (item.id !== id) return item;
        const isInstitutionRelation = queue === "verifications" && (item as VerificationRequest).kind === "INSTITUTION_RELATION";
        const reviewAccessEndsAt = status === "APPROVED" && isInstitutionRelation ? addSixMonths(now) : undefined;
        const note = status === "NEEDS_INFO"
          ? "체험 운영자가 보완 자료 안내 상태로 변경했어요. 부여된 후기 열람권은 제거됩니다."
          : status === "REJECTED"
            ? "체험 운영자가 반려 상태로 변경했어요. 부여된 후기 열람권은 제거됩니다."
            : reviewAccessEndsAt
              ? `체험 운영자가 승인했어요. 역할별 후기 열람권을 ${toDateLabel(reviewAccessEndsAt)}까지 부여했습니다.`
              : "체험 운영자가 승인 상태로 변경했어요. 기관 관계 인증이 아니므로 후기 열람권은 부여되지 않습니다.";
        return { ...item, status, reviewAccessEndsAt, history: [...item.history, { status, note, createdAt: now }] };
      }),
    }));
    setNotice("체험용 처리 상태를 이 브라우저에서 변경했어요. 실제 사용자에게 전송되거나 서버에 반영되지 않습니다.");
  };

  if (isProduction) {
    return <><ServerAdminConsole /><ServerRuntimeStatus /><ServerDataOperations /><ServerPublicInformationManager /><ServerInstitutionDetailManager /><ServerFeatureFlags /><ServerObservability /></>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>관리자</p>
          <h1>운영 요약 대시보드</h1>
          <p>체험용 운영 화면입니다. 실제 통계, 개인정보, 신고 처리는 서버 연결 뒤 활성화됩니다.</p>
        </div>
        <div className={styles.demoBadge}>
          <AlertTriangle aria-hidden="true" />
          체험용 운영 화면
        </div>
      </header>

      <section className={styles.metricGrid} aria-label="운영 처리 요약">
        {operationMetrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <article className={`${styles.metricCard} ${styles[metric.tone]}`} key={metric.title}>
              <div className={styles.metricTop}>
                <span className={styles.metricIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <span className={styles.demoText}>체험용 운영 화면</span>
              </div>
              <h2>{metric.title}</h2>
              <strong>{metric.count}</strong>
              <p>{metric.helper}</p>
            </article>
          );
        })}
      </section>

      <section className={styles.releaseGate} aria-labelledby="release-gate-title">
        <div className={styles.releaseGateHeader}>
          <div>
            <p className={styles.kicker}>출시 게이트</p>
            <h2 id="release-gate-title">공개 상용 출시 전 확인</h2>
            <p>화면과 개발 기반은 준비됐지만, 외부 연결과 운영 조건이 남아 있습니다.</p>
          </div>
          <span className={styles.releaseBlocked}><AlertTriangle aria-hidden="true" /> 지금 공개 상용 출시 불가</span>
        </div>

        <div className={styles.releaseGateGrid}>
          <article className={styles.releaseReady}>
            <div className={styles.releaseCardTitle}><CheckCircle2 aria-hidden="true" /><h3>준비됨</h3></div>
            <ul>{releaseGateReady.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article className={styles.releaseRequired}>
            <div className={styles.releaseCardTitle}><PlugZap aria-hidden="true" /><h3>외부 연결 필요</h3></div>
            <ul>{releaseGateRequired.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      </section>

      <section className={styles.operationQueue} aria-labelledby="operation-queue-title">
        <div className={styles.workspaceHeader}>
          <div>
            <p className={styles.kicker}>체험용 운영 큐</p>
            <h2 id="operation-queue-title">사용자 요청 {queueCount}건</h2>
          </div>
          <FileClock aria-hidden="true" />
        </div>
        <p className={styles.queueNotice}>신뢰 센터에서 이 브라우저로 접수한 요청만 보입니다. 아래 처리는 체험 상태 변경이며 실제 심사, 알림, 서버 조치를 수행하지 않습니다.</p>
        {notice ? <p className={styles.queueFeedback} role="status">{notice}</p> : null}
        {!hydrated ? <p className={styles.queueEmpty} aria-busy="true">체험 요청을 불러오는 중이에요.</p> : null}
        {hydrated && queueCount === 0 ? <p className={styles.queueEmpty}>아직 이 브라우저에서 접수한 인증·정정·신고 요청이 없어요. 신뢰 센터에서 요청을 제출하면 이곳에 표시됩니다.</p> : null}
        {hydrated && queueCount > 0 ? <div className={styles.queueGroups}>
          <QueueGroup title="인증 요청" items={operations.verifications} empty="접수된 인증 요청이 없어요." render={(item) => <><strong>{institutionName(item.institutionId)}</strong><p>{verificationKindLabels[item.kind]} · {item.role === "TUTOR" ? "튜터" : roleLabels[item.role]} · {verificationEvidenceLabels[item.evidenceType]}</p><small>이용·근무 기간: {item.relationshipPeriod}</small></>} onUpdate={(id, status) => updateStatus("verifications", id, status)} />
          <QueueGroup title="기관 정보 정정" items={operations.corrections} empty="접수된 정보 정정 요청이 없어요." render={(item) => <><strong>{institutionName(item.institutionId)}</strong><p>{correctionIssueLabels[item.issue]}</p><small>수정 제안: {item.requestedInfo}</small></>} onUpdate={(id, status) => updateStatus("corrections", id, status)} />
          <QueueGroup title="콘텐츠 신고" items={operations.reports} empty="접수된 콘텐츠 신고가 없어요." render={(item) => <><strong>{institutionName(item.institutionId)}</strong><p>{reportIssueLabels[item.issue]} · {item.contentLocation}</p><small>{item.reason}</small></>} onUpdate={(id, status) => updateStatus("reports", id, status)} />
        </div> : null}
      </section>

      <section className={styles.workspace} aria-labelledby="admin-readiness-title">
        <div className={styles.workspaceHeader}>
          <div>
            <p className={styles.kicker}>연결 준비 상태</p>
            <h2 id="admin-readiness-title">실제 운영 전 확인할 연결 항목</h2>
          </div>
          <PlugZap aria-hidden="true" />
        </div>

        <div className={styles.readinessList}>
          {readinessItems.map((item) => {
            const Icon = item.icon;

            return (
              <article className={styles.readinessItem} key={item.title}>
                <span className={styles.readinessIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.helper}</p>
                </div>
                <span className={styles.status}>{item.status}</span>
              </article>
            );
          })}
        </div>
      </section>

      <aside className={styles.operatorNote} aria-label="관리자 안내">
        <CheckCircle2 aria-hidden="true" />
        <p>
          이 화면의 수치는 모두 체험용 운영 화면 기준입니다. 실제 관리자 기능은 인증, 후기 검수, 신고 처리 서버가
          연결된 뒤 사용해야 합니다.
        </p>
      </aside>
    </main>
  );
}

function QueueGroup<T extends { id: string; status: OperationStatus; submittedAt: string; history: { status: OperationStatus; note: string; createdAt: string }[] }>({ title, items, empty, render, onUpdate }: { title: string; items: T[]; empty: string; render: (item: T) => ReactNode; onUpdate: (id: string, status: Exclude<OperationStatus, "PENDING">) => void }) {
  return <section className={styles.queueGroup} aria-label={title}>
    <div className={styles.queueGroupHeader}><h3>{title}</h3><span>{items.length}건</span></div>
    {items.length === 0 ? <p className={styles.groupEmpty}>{empty}</p> : <div className={styles.queueList}>{items.map((item) => <article className={styles.queueCard} key={item.id}>
      <div className={styles.queueCardTop}><span className={styles.queueStatus} data-status={item.status}>{operationStatusLabels[item.status]}</span><time dateTime={item.submittedAt}>{formatDate(item.submittedAt)}</time></div>
      <div className={styles.queueCardBody}>{render(item)}</div>
      <div className={styles.queueActions} aria-label="체험 처리 상태 변경"><button type="button" onClick={() => onUpdate(item.id, "NEEDS_INFO")}>보완 필요</button><button type="button" onClick={() => onUpdate(item.id, "APPROVED")}>승인</button><button type="button" onClick={() => onUpdate(item.id, "REJECTED")}>반려</button></div>
      <details><summary>처리 이력 {item.history.length}건</summary>{item.history.map((entry) => <div className={styles.historyEntry} key={entry.createdAt + entry.status}><span className={styles.queueStatus} data-status={entry.status}>{operationStatusLabels[entry.status]}</span><p>{entry.note}</p><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></div>)}</details>
    </article>)}</div>}
  </section>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
}

function addSixMonths(value: string) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + 6);
  return date.toISOString();
}

function toDateLabel(value: string) {
  return value.slice(0, 10);
}
