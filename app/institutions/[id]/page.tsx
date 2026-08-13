import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BusFront,
  CalendarCheck,
  CarFront,
  CircleDollarSign,
  Clock,
  ExternalLink,
  Flag,
  FlaskConical,
  MapPin,
  Megaphone,
  MessageCircleMore,
  MessageSquareText,
  Navigation,
  Phone,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Star,
  Store,
  TrainFront,
  UsersRound,
} from "lucide-react";
import { ExternalReviewSources } from "@/components/external-review-sources";
import { InstitutionCard } from "@/components/institution-card";
import { ReviewAccessPanel } from "@/components/review-access-panel";
import { CanonicalInstitutionActions } from "@/components/canonical-institution-actions";
import { InstitutionReviewSummary } from "@/components/institution-review-summary";
import { InstitutionPublicHandlingTimeline } from "@/components/institution-public-handling-timeline";
import { CanonicalTrustOverview } from "@/components/canonical-trust-overview";
import { getPublicCanonicalInstitution, type CanonicalInstitution } from "@/lib/canonical-institutions";
import { getInstitution, institutions } from "@/lib/demo-data";
import { getInstitutionOfficialReplies } from "@/lib/institution-replies";
import { formatFee, institutionTypeLabels, roleLabels, zoneLabels } from "@/lib/labels";
import { costSourceLabels, localDepthByInstitutionId, recruitingStatusLabels } from "@/lib/local-depth-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Institution } from "@/lib/types";
import {
  getInstitutionTrustSummary,
  getWorkplaceSummary,
  workplaceCategoryLabels,
} from "@/lib/workplace-data";
import styles from "./institution-detail.module.css";

interface InstitutionDetailPageProps {
  params: Promise<{ id: string }>;
}

const feeSourceLabels: Record<Institution["feeSource"], string> = {
  PUBLIC: "공공 공개 자료",
  INSTITUTION: "기관 제공 자료",
  VERIFIED_USE: "인증 이용자 제보",
  UNCONFIRMED: "추가 확인 필요",
};
const trustLevelLabels = { PUBLIC_DATA: "공공데이터", INSTITUTION_CONFIRMED: "기관 확인", PAYMENT_ENROLLMENT_VERIFIED: "결제·재원 확인", STAFF_VERIFIED: "직원 확인", PARENT_REPORTED: "학부모 제보", UNVERIFIED: "확인 전" } as const;

export function generateStaticParams() {
  return institutions.map((institution) => ({ id: institution.id }));
}

export default async function InstitutionDetailPage({ params }: InstitutionDetailPageProps) {
  const { id } = await params;
  const accountMode = isSupabaseConfigured();

  if (accountMode) {
    const result = await getPublicCanonicalInstitution(id);
    return <CanonicalInstitutionDetail institution={result.institution} error={result.error} />;
  }

  const institution = getInstitution(id);

  if (!institution) notFound();

  const mapUrl = "https://map.kakao.com/link/search/" + encodeURIComponent(institution.address);
  const phoneUrl = "tel:" + institution.phone;
  const messageUrl = "sms:" + institution.phone;
  const workplace = getWorkplaceSummary(institution.id);
  const trust = getInstitutionTrustSummary(institution.id);
  const localDepth = localDepthByInstitutionId[institution.id];
  const officialReplies = getInstitutionOfficialReplies(institution.id);

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/discover">
        <ArrowLeft size={18} aria-hidden="true" />
        목록으로
      </Link>

      <section className={styles.hero} aria-labelledby="institution-title">
        <span className={styles.demoBadge}>체험용 데이터</span>
        <div className={styles.heroTitle}>
          <p>
            {zoneLabels[institution.zone]} · {institution.neighborhood} ·{" "}
            {institutionTypeLabels[institution.type]}
          </p>
          <h1 id="institution-title">{institution.name}</h1>
          <span>{institution.status === "OPEN" ? "운영중" : "운영 확인 필요"}</span>
        </div>

        <div className={styles.heroActions} aria-label="기관 연락과 이동">
          <a href={phoneUrl}>
            <Phone size={17} aria-hidden="true" />
            전화
          </a>
          <a href={mapUrl} target="_blank" rel="noreferrer">
            <Navigation size={17} aria-hidden="true" />
            길찾기
          </a>
          {institution.website ? (
            <a href={institution.website} target="_blank" rel="noreferrer">
              <ExternalLink size={17} aria-hidden="true" />
              홈페이지
            </a>
          ) : null}
          {institution.appInquiryAvailable ? (
            <a href={messageUrl}>
              <MessageCircleMore size={17} aria-hidden="true" />
              문자 문의
            </a>
          ) : null}
        </div>
      </section>

      {trust ? (
        <section className={styles.trustSection} aria-labelledby="trust-card-title">
          <div className={styles.trustHeader}>
            <div>
              <ShieldCheck size={20} aria-hidden="true" />
              <h2 id="trust-card-title">기관 신뢰 카드</h2>
            </div>
            <span>정보 완성도 {trust.dataCompleteness}%</span>
          </div>
          <div className={styles.trustGrid}>
            <div>
              <span>공공데이터</span>
              <strong>{trust.publicSourceFreshness === "RECENT" ? "최신 기준일 확인" : "갱신 확인 필요"}</strong>
            </div>
            <div>
              <span>기관 공식 확인</span>
              <strong>{trust.institutionConfirmed ? "확인됨" : "확인 대기"}</strong>
            </div>
            <div>
              <span>인증 후기</span>
              <strong>학부모 {trust.verifiedParentReviews}·학생 {trust.verifiedStudentReviews}·교육자 {trust.verifiedEducatorReviews}건</strong>
            </div>
            <div>
              <span>비용 최근 확인</span>
              <strong>{trust.latestFeeCheck}</strong>
            </div>
            <div>
              <span>기관 공식 답변</span>
              <strong>{trust.latestOfficialReply ?? "답변 없음"}</strong>
            </div>
            <div>
              <span>정정 상태</span>
              <strong>{trust.correctionStatus === "CLEAR" ? "진행 사항 없음" : trust.correctionStatus === "REVIEWING" ? "운영자 확인 중" : "정보 보완 필요"}</strong>
            </div>
          </div>
          <p>출처·확인일·인증 주체를 분리한 체험 신뢰 지표예요.</p>
        </section>
      ) : null}

      <InstitutionCard institution={institution} variant="featured" />

      <section className={styles.officialReplySection} aria-labelledby="official-replies-title">
        <div className={styles.officialReplyHeader}>
          <div>
            <MessageSquareText size={20} aria-hidden="true" />
            <h2 id="official-replies-title">기관 공식 답변</h2>
          </div>
          <span>체험용 공식 답변</span>
        </div>
        {officialReplies.length > 0 ? (
          <div className={styles.officialReplyList}>
            {officialReplies.map((reply) => (
              <article key={reply.institutionId + reply.respondedAt}>
                <div><strong>{reply.topic}</strong><time dateTime={reply.respondedAt}>응답일 {reply.respondedAt}</time></div>
                <p>{reply.body}</p>
                <small>실제 기관이 작성한 답변이 아닌 체험용 예시입니다.</small>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.officialReplyEmpty}>아직 공개된 답변 없음</p>
        )}
      </section>

      <section className={styles.workplaceSection} aria-labelledby="workplace-title">
        <div className={styles.workplaceHeader}>
          <div>
            <UsersRound size={20} aria-hidden="true" />
            <span>교육자 내부 경험</span>
          </div>
          <h2 id="workplace-title">일하기 좋은 환경인지 따로 봐요</h2>
          <p>학부모·학생 평점과 합치지 않고, 근무 인증을 완료한 교육자 후기만 반영해요.</p>
        </div>

        {workplace?.publicScore !== null && workplace ? (
          <>
            <div className={styles.workplaceScore}>
              <strong>{workplace.publicScore.toFixed(1)}</strong>
              <span>5점 만점 · 인증 {workplace.verifiedReviewCount}건</span>
            </div>
            <div className={styles.workplaceCategories}>
              {Object.entries(workplace.categoryScores).map(([category, score]) => (
                <div key={category}>
                  <span>{workplaceCategoryLabels[category as keyof typeof workplaceCategoryLabels]}</span>
                  <strong>{score?.toFixed(1)}</strong>
                </div>
              ))}
            </div>
            <ul className={styles.workplaceHighlights}>
              {workplace.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
            </ul>
          </>
        ) : (
          <div className={styles.workplaceLocked}>
            <LockMessage />
            <div>
              <strong>인증 후기 3건 이상일 때 공개해요</strong>
              <span>현재 인증 {workplace?.verifiedReviewCount ?? 0}건 · 작성자 추정을 막기 위한 기준입니다.</span>
            </div>
          </div>
        )}

        <div className={styles.workplaceActions}>
          <Link href="/review">익명 근무후기 작성</Link>
          <Link href="/rankings?tab=workplace">좋은 일터 순위</Link>
        </div>
      </section>

      <section className={styles.infoGrid} aria-label="기관 기본 정보">
        <div className={styles.infoCard}>
          <Clock size={19} aria-hidden="true" />
          <span>운영시간</span>
          <strong>{institution.operatingHours}</strong>
        </div>
        <div className={styles.infoCard}>
          <CircleDollarSign size={19} aria-hidden="true" />
          <span>월 비용</span>
          <strong>{formatFee(institution.monthlyFee)}</strong>
        </div>
        <div className={styles.infoCard}>
          <ReceiptText size={19} aria-hidden="true" />
          <span>비용 출처</span>
          <strong>{feeSourceLabels[institution.feeSource]}</strong>
        </div>
        <div className={styles.infoCard}>
          <CalendarCheck size={19} aria-hidden="true" />
          <span>기준일</span>
          <strong>{institution.sourceDate}</strong>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="class-service-title">
        <div className={styles.sectionTitle}>
          <FlaskConical size={18} aria-hidden="true" />
          <h2 id="class-service-title">통학과 체험수업</h2>
        </div>

        <div className={styles.serviceGrid}>
          <article data-active={institution.pickupAvailable}>
            <BusFront size={20} aria-hidden="true" />
            <span>통학차량</span>
            <strong>{institution.pickupAvailable ? "운영 표시" : "운영 확인 필요"}</strong>
          </article>
          <article data-active={institution.trialClassAvailable}>
            <FlaskConical size={20} aria-hidden="true" />
            <span>체험수업</span>
            <strong>{institution.trialClassAvailable ? "신청 가능 표시" : "일정 확인 필요"}</strong>
          </article>
          <article data-active={institution.appInquiryAvailable}>
            <MessageCircleMore size={20} aria-hidden="true" />
            <span>바로 문의</span>
            <strong>{institution.appInquiryAvailable ? "문자 문의 가능" : "전화 문의"}</strong>
          </article>
        </div>

        <p className={styles.demoNotice}>
          위 운영 정보는 체험용 데이터입니다. 실제 신청 전 기관에 다시 확인해주세요.
        </p>
      </section>

      {localDepth ? (
        <section className={styles.localDepthSection} aria-labelledby="local-depth-title">
          <div className={styles.localDepthHeader}>
            <div>
              <p>동탄 선택 참고</p>
              <h2 id="local-depth-title">생활권·통학·비용을 나눠서 봐요</h2>
            </div>
            <span>체험용 데이터</span>
          </div>
          <p className={styles.localDepthNotice}>아래 생활권, 셔틀, 모집·비용 정보는 실제 신청이나 계약의 근거가 아닌 화면 체험용 예시입니다. 기관에 최신 내용을 다시 확인하세요.</p>

          <div className={styles.localDecisionGrid}>
            <article className={styles.localDecisionCard}>
              <MapPin size={19} aria-hidden="true" />
              <span>생활권</span>
              <strong>{localDepth.livingAreas.join(" · ")}</strong>
              <small>가까운 주거권: {localDepth.nearbyComplexes.join(" · ")}</small>
            </article>
            <article className={styles.localDecisionCard}>
              <TrainFront size={19} aria-hidden="true" />
              <span>통학 참고</span>
              <strong>{localDepth.commute.reference}</strong>
              <small>{localDepth.commute.walkMinutes} · {localDepth.commute.transitMinutes}</small>
            </article>
            <article className={styles.localDecisionCard} data-status={localDepth.recruiting.status}>
              <Store size={19} aria-hidden="true" />
              <span>모집·대기</span>
              <strong>{recruitingStatusLabels[localDepth.recruiting.status]}</strong>
              <small>{localDepth.recruiting.detail} · 확인일 {localDepth.recruiting.lastChecked}</small>
            </article>
          </div>

          <div className={styles.shuttlePanel}>
            <div className={styles.shuttleTitle}><CarFront size={19} aria-hidden="true" /><h3>셔틀 운행 참고</h3></div>
            {localDepth.shuttle.available ? (
              <dl>
                <div><dt>운행 생활권</dt><dd>{localDepth.shuttle.zones.join(" · ")}</dd></div>
                <div><dt>참고 승하차</dt><dd>{localDepth.shuttle.stops.join(" · ")}</dd></div>
              </dl>
            ) : <p>통학차량 운행 표시가 없어요.</p>}
            <small>{localDepth.shuttle.note}</small>
          </div>

          <div className={styles.depthSplit}>
            <div>
              <div className={styles.depthSubheading}><ReceiptText size={18} aria-hidden="true" /><h3>프로그램별 비용 참고</h3></div>
              <ul className={styles.costList}>
                {localDepth.costs.map((cost) => <li key={cost.label}><span>{cost.label}</span><strong>{cost.amount === null ? "확인 필요" : cost.amount === 0 ? "별도 없음 표시" : formatFee(cost.amount)}</strong><small>{costSourceLabels[cost.source]} · 확인일 {cost.verifiedAt}</small></li>)}
              </ul>
            </div>
            <div>
              <div className={styles.depthSubheading}><Clock size={18} aria-hidden="true" /><h3>최근 변경 이력</h3></div>
              <ol className={styles.changeList}>
                {localDepth.changes.map((change) => <li key={change.date + change.field}><time dateTime={change.date}>{change.date}</time><div><strong>{change.field}</strong><p>{change.detail}</p><small>{costSourceLabels[change.source]}</small></div></li>)}
              </ol>
            </div>
          </div>
        </section>
      ) : null}

      {institution.news.length > 0 ? (
        <section className={styles.section} aria-labelledby="institution-news-title">
          <div className={styles.sectionTitle}>
            <Megaphone size={18} aria-hidden="true" />
            <h2 id="institution-news-title">설명회·레벨테스트·특강</h2>
          </div>

          <ul className={styles.newsList}>
            {institution.news.map((item) => (
              <li key={item.title + item.date}>
                <div>
                  <span>{item.type === "BRIEFING" ? "설명회" : item.type === "LEVEL_TEST" ? "레벨테스트" : "특강"}</span>
                  <strong>{item.title}</strong>
                </div>
                <p>
                  {item.date} · {item.status === "OPEN" ? "신청 가능 표시" : "마감 표시"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="source-title">
        <div className={styles.sectionTitle}>
          <MapPin size={18} aria-hidden="true" />
          <h2 id="source-title">출처와 위치</h2>
        </div>
        <dl className={styles.definitionList}>
          <div>
            <dt>주소</dt>
            <dd>{institution.address}</dd>
          </div>
          <div>
            <dt>출처</dt>
            <dd>{institution.sourceName}</dd>
          </div>
          <div>
            <dt>자료 기준일</dt>
            <dd>
              <time dateTime={institution.sourceDate}>{institution.sourceDate}</time>
            </dd>
          </div>
        </dl>
        <div className={styles.trustActions}>
          <Link href={`/trust-center?tab=correction&institution=${institution.id}`}>
            <RefreshCcw size={17} aria-hidden="true" />
            정보 정정 요청
          </Link>
          <Link href={`/trust-center?tab=report&institution=${institution.id}`}>
            <Flag size={17} aria-hidden="true" />
            콘텐츠 신고
          </Link>
        </div>
      </section>

      <section id="edutalk-reviews" className={styles.section} aria-labelledby="rating-title">
        <div className={styles.sectionTitle}>
          <Star size={18} aria-hidden="true" />
          <h2 id="rating-title">역할별 평점</h2>
        </div>

        {accountMode ? <InstitutionReviewSummary institutionId={institution.id} /> : <div className={styles.ratingList}>
          {institution.ratings.map((rating) => (
            <article key={rating.role} className={styles.ratingCard}>
              <div>
                <span>{roleLabels[rating.role]}</span>
                <strong>
                  {rating.isPublic && rating.score !== null
                    ? rating.score.toFixed(1) + "점"
                    : "공개 기준 대기"}
                </strong>
              </div>
              <p>
                {rating.count}건 기준
                {!rating.isPublic ? " · 인원 기준 충족 후 공개" : ""}
              </p>
            </article>
          ))}
        </div>}
      </section>

      <ExternalReviewSources institution={institution} />

      <section className={styles.section} aria-labelledby="review-title">
        <div className={styles.sectionTitle}>
          <MessageSquareText size={18} aria-hidden="true" />
          <h2 id="review-title">리뷰 하이라이트</h2>
        </div>

        <ReviewAccessPanel institutionId={institution.id} highlights={institution.reviewHighlights} />
      </section>

      <section className={styles.section} aria-labelledby="fit-title">
        <div className={styles.sectionTitle}>
          <UsersRound size={18} aria-hidden="true" />
          <h2 id="fit-title">대상과 수업</h2>
        </div>

        <div className={styles.tagGroup}>
          {[...institution.ageGroups, ...institution.subjects, ...institution.tags].map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>
    </main>
  );
}

function CanonicalInstitutionDetail({ institution, error }: { institution: CanonicalInstitution | null; error: string | null }) {
  if (!institution) {
    return <main className={styles.page}>
      <Link className={styles.backLink} href="/discover"><ArrowLeft size={18} aria-hidden="true" />목록으로</Link>
      <section className={styles.canonicalEmpty} role={error ? "alert" : "status"}>
        <Store size={32} aria-hidden="true" />
        <h1>{error ? "공개 기관 정보를 불러오지 못했어요" : "공개 기관 정보를 찾지 못했어요"}</h1>
        <p>{error ?? "이 주소의 공개 canonical 기관이 없거나 아직 공개되지 않았습니다. 체험 기관 데이터는 표시하지 않습니다."}</p>
        <Link href="/discover">공개 기관 목록 보기</Link>
      </section>
    </main>;
  }

  const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(institution.address)}`;
  const phoneUrl = institution.phone ? `tel:${institution.phone}` : null;
  const checkedDate = institution.checkedAt ? institution.checkedAt.slice(0, 10) : null;
  return <main className={styles.page}>
    <Link className={styles.backLink} href="/discover"><ArrowLeft size={18} aria-hidden="true" />목록으로</Link>
    <section className={styles.hero} aria-labelledby="institution-title">
      <span className={styles.canonicalBadge}>공개 canonical 정보</span>
      <div className={styles.heroTitle}><p>{institution.zone === "OTHER" ? "지역 확인 필요" : zoneLabels[institution.zone]} · {institutionTypeLabels[institution.type]}</p><h1 id="institution-title">{institution.name}</h1><span>공개 정보 확인</span></div>
      <div className={styles.heroActions} aria-label="기관 연락과 위치">{phoneUrl ? <a href={phoneUrl}><Phone size={17} aria-hidden="true" />전화</a> : null}{institution.homepageUrl ? <a href={institution.homepageUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} aria-hidden="true" />홈페이지</a> : null}<a href={mapUrl} target="_blank" rel="noreferrer"><Navigation size={17} aria-hidden="true" />길찾기</a></div>
    </section>
    <CanonicalTrustOverview institution={institution} />

    <section className={styles.canonicalDetail} aria-labelledby="canonical-info-title">
      <div className={styles.sectionTitle}><ShieldCheck size={18} aria-hidden="true" /><h2 id="canonical-info-title">공개 기관 정보</h2></div>
      <div className={styles.canonicalInfoGrid}>
        <div><span>주소</span><strong>{institution.address}</strong></div>
        <div><span>기관 유형</span><strong>{institutionTypeLabels[institution.type]}</strong></div>
        <div><span>지역</span><strong>{institution.zone === "OTHER" ? "기관 확인 필요" : zoneLabels[institution.zone]}</strong></div>
        <div><span>최근 확인일</span><strong>{checkedDate ?? "기관 확인 필요"}</strong></div>
        {institution.phone ? <div><span>공개 전화</span><strong>{institution.phone}</strong></div> : null}
      </div>
      <p>상용 모드는 공개 승인된 canonical 기관 정보와 상세 항목만 표시합니다. 확인되지 않은 비용·셔틀·모집·프로그램은 추정하지 않고 기관 확인 필요로 안내합니다.</p>
    </section>
    <CanonicalInstitutionActions institutionId={institution.publicSlug} />
    <ExternalReviewSources canonicalSources={institution.externalReviewSources} />

    <section className={styles.canonicalDetail} aria-labelledby="canonical-trust-title">
      <div className={styles.sectionTitle}><ShieldCheck size={18} aria-hidden="true" /><h2 id="canonical-trust-title">공개 필드 신뢰 카드</h2></div>
      {institution.provenance.length ? <div className={styles.canonicalProvenanceList}>{institution.provenance.map((item) => <article key={item.field}><strong>{item.field}</strong><span>{trustLevelLabels[item.trustLevel]}</span><p>{item.source} · 확인일 {formatCanonicalDate(item.checkedAt)}</p>{item.confirmedBy ? <small>확인 주체: {item.confirmedBy}</small> : <small>확인 주체: 기관 확인 필요</small>}</article>)}</div> : <p className={styles.canonicalCaption}>공개된 필드별 신뢰 정보가 없어요. 확인되지 않은 값은 신뢰등급을 추정하지 않습니다.</p>}
    </section>

    <section className={styles.canonicalDetail} aria-labelledby="canonical-operation-title">
      <div className={styles.sectionTitle}><ReceiptText size={18} aria-hidden="true" /><h2 id="canonical-operation-title">비용·통학·모집·프로그램</h2></div>
      <div className={styles.canonicalOperationGrid}>
        <article><h3>비용</h3>{institution.costs.length ? <ul>{institution.costs.map((item) => <li key={`${item.item}-${item.checkedAt}`}><strong>{item.item}</strong><span>{item.amountDisplay}</span><small>{item.source} · 확인일 {formatCanonicalDate(item.checkedAt)}</small></li>)}</ul> : <p>기관 확인 필요</p>}</article>
        <article><h3>셔틀</h3>{institution.shuttle ? <div className={styles.canonicalDetailValue}><strong>{institution.shuttle.available === true ? "제공" : institution.shuttle.available === false ? "미제공" : "기관 확인 필요"}</strong>{institution.shuttle.zones.length ? <span>운행 권역: {institution.shuttle.zones.join(" · ")}</span> : <span>운행 권역: 기관 확인 필요</span>}<small>{institution.shuttle.source} · 확인일 {formatCanonicalDate(institution.shuttle.checkedAt)}</small></div> : <p>기관 확인 필요</p>}</article>
        <article><h3>모집·대기</h3>{institution.recruitment ? <div className={styles.canonicalDetailValue}><strong>{institution.recruitment.status ?? "기관 확인 필요"}</strong><span>{institution.recruitment.waitlist ?? "대기 정보: 기관 확인 필요"}</span><small>{institution.recruitment.source} · 확인일 {formatCanonicalDate(institution.recruitment.checkedAt)}</small></div> : <p>기관 확인 필요</p>}</article>
        <article><h3>프로그램</h3>{institution.programs.length ? <ul>{institution.programs.map((item) => <li key={`${item.name}-${item.checkedAt}`}><strong>{item.name}</strong><span>{item.audience ?? "대상: 기관 확인 필요"}</span><small>{item.source} · 확인일 {formatCanonicalDate(item.checkedAt)}</small></li>)}</ul> : <p>기관 확인 필요</p>}</article>
      </div>
    </section>

    <section className={styles.canonicalDetail} aria-labelledby="canonical-local-title">
      <div className={styles.sectionTitle}><MapPin size={18} aria-hidden="true" /><h2 id="canonical-local-title">생활권·기준 출발지 참고</h2></div>
      {institution.localContext ? <div className={styles.canonicalLocalGrid}>
        <article><span>생활권</span><strong>{institution.localContext.livingArea}</strong></article>
        <article><span>법정동</span><strong>{institution.localContext.legalDong ?? "기관 확인 필요"}</strong></article>
        <article><span>행정동</span><strong>{institution.localContext.administrativeDong ?? "기관 확인 필요"}</strong></article>
        <article><span>주요 주거권·단지</span><strong>{institution.localContext.residentialArea ?? "기관 확인 필요"}</strong></article>
        <p className={styles.canonicalLocalSource}>{institution.localContext.source} · 확인일 {formatCanonicalDate(institution.localContext.checkedAt)}</p>
      </div> : <p className={styles.canonicalCaption}>생활권·법정동·행정동 공개 정보가 아직 없어요. 기관 확인 필요</p>}
      {institution.travelReferences.length ? <ul className={styles.canonicalTravelList}>{institution.travelReferences.map((item) => <li key={`${item.originType}-${item.originLabel}-${item.checkedAt}`}><div><strong>{item.originType === "SCHOOL" ? "학교" : item.originType === "KINDERGARTEN" ? "유치원" : "주거 단지"} 기준 · {item.originLabel}</strong><span>{item.distanceMeters ? `${item.distanceMeters.toLocaleString("ko-KR")}m` : item.distanceNote ?? "거리: 기관 확인 필요"}</span><span>{item.travelMinutes ? `${item.travelMinutes}분` : item.travelNote ?? "이동 참고: 기관 확인 필요"}</span></div><small>{item.source} · 확인일 {formatCanonicalDate(item.checkedAt)}</small></li>)}</ul> : <p className={styles.canonicalCaption}>승인된 학교·유치원·주거 단지 기준 거리·이동 참고가 아직 없어요. 기관 확인 필요</p>}
      <p className={styles.canonicalCaption}>거리와 이동 시간은 출처·확인일이 있는 공개 승인 값만 표시하며, 실제 경로·교통 상황은 달라질 수 있어요.</p>
    </section>

    <section className={styles.canonicalDetail} aria-labelledby="canonical-history-title">
      <div className={styles.sectionTitle}><Clock size={18} aria-hidden="true" /><h2 id="canonical-history-title">공개 정보 변경 이력</h2></div>
      {institution.changeHistory.length ? <ol className={styles.canonicalChangeList}>{institution.changeHistory.map((item) => <li key={`${item.field}-${item.changedAt}`}><time dateTime={item.changedAt}>{formatCanonicalDate(item.changedAt)}</time><div><strong>{item.field}</strong><p>{item.summary}</p><small>{item.source}</small></div></li>)}</ol> : <p className={styles.canonicalCaption}>공개된 변경 이력이 없어요. 기관 확인이 필요한 항목은 추정해 표시하지 않습니다.</p>}
    </section>

    <InstitutionPublicHandlingTimeline events={institution.publicHandlingTimeline} />

    <section id="edutalk-reviews" className={styles.section} aria-labelledby="canonical-rating-title">
      <div className={styles.sectionTitle}><Star size={18} aria-hidden="true" /><h2 id="canonical-rating-title">학생·학부모·교육자 점수</h2></div>
      <p className={styles.canonicalCaption}>승인된 후기만 역할별로 나눠 집계합니다. 교육자 점수는 작성자 추정을 막기 위해 3건 이상일 때 공개합니다.</p>
      <InstitutionReviewSummary institutionId={institution.publicSlug} />
    </section>

    <section className={styles.workplaceSection} aria-labelledby="canonical-workplace-title">
      <div className={styles.workplaceHeader}>
        <div><UsersRound size={20} aria-hidden="true" /><span>교육자 내부 경험</span></div>
        <h2 id="canonical-workplace-title">교육자가 만족하는 일터인지 따로 확인해요</h2>
        <p>학부모·학생 평가와 합치지 않습니다. 근무 관계가 승인된 교육자 후기만 별도 열람할 수 있어요.</p>
      </div>
      <ReviewAccessPanel institutionId={institution.publicSlug} highlights={[]} />
      <div className={styles.workplaceActions}><Link href={`/review?institution=${institution.publicSlug}&role=TEACHER`}>익명 근무후기 작성</Link><Link href="/rankings?tab=workplace">좋은 일터 순위</Link></div>
    </section>

    <section className={styles.section} aria-labelledby="source-title">
      <div className={styles.sectionTitle}><MapPin size={18} aria-hidden="true" /><h2 id="source-title">정보 정정과 신고</h2></div>
      <p className={styles.canonicalCaption}>표시 내용에 수정이 필요하면 신뢰 센터에 알려주세요.</p>
      <div className={styles.trustActions}>
        <Link href={`/trust-center?tab=correction&institution=${institution.publicSlug}`}><RefreshCcw size={17} aria-hidden="true" />정보 정정 요청</Link>
        <Link href={`/trust-center?tab=report&institution=${institution.publicSlug}`}><Flag size={17} aria-hidden="true" />콘텐츠 신고</Link>
      </div>
    </section>
  </main>;
}

function formatCanonicalDate(value: string) { return value.slice(0, 10); }

function LockMessage() {
  return <ShieldCheck size={22} aria-hidden="true" />;
}
