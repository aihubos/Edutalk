"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock3,
  ImagePlus,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { demoTutorProfiles, demoTutorReviews, getTutorRankBreakdown, getTutorRating, getTutorVerifiedCredentials, mapStoredTutorProfile, mapStoredTutorReview } from "@/lib/tutor-data";
import type { TutorProfile, TutorReview } from "@/lib/types";
import styles from "./tutor-detail.module.css";

const formatPrice = (price: number) => `${price.toLocaleString("ko-KR")}원`;

const getReviewDate = (isoDate: string) => new Date(isoDate).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

const mergeById = <T extends { id: string }>(demoItems: T[], localItems: T[]) => {
  const localIds = new Set(localItems.map((item) => item.id));
  return [...localItems, ...demoItems.filter((item) => !localIds.has(item.id))];
};

const isString = (value: string | string[] | undefined): value is string => typeof value === "string";

export default function TutorDetailPage() {
  const params = useParams();
  const tutorId = isString(params.id) ? params.id : "";
  const { tutorProfiles, tutorReviews, addTutorReview } = useApp();
  const configured = isSupabaseConfigured();
  const [storedProfiles, setStoredProfiles] = useState<TutorProfile[]>([]);
  const [storedReviews, setStoredReviews] = useState<TutorReview[]>([]);
  const reviewIdPrefix = useId().replaceAll(":", "");
  const [rating, setRating] = useState("5");
  const [content, setContent] = useState("");
  const [verifiedLesson, setVerifiedLesson] = useState(false);
  const [lessonCode, setLessonCode] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoDataUrls, setPhotoDataUrls] = useState<string[]>([]);
  const [reviewMedia, setReviewMedia] = useState<Record<string, Array<{ id: string; url: string }>>>({});
  const [contactMessage, setContactMessage] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [serverLoading, setServerLoading] = useState(configured);
  const [serverError, setServerError] = useState("");
  const [serverReady, setServerReady] = useState(!configured);
  const [notice, setNotice] = useState(configured ? "계정 후기는 1회용 수업 확인 코드와 운영자 심사를 거쳐 공개됩니다." : "후기 사진은 서버에 업로드되지 않고 이 기기에서 미리보기로만 사용됩니다.");

  const profiles = useMemo(() => configured ? storedProfiles : mergeById(demoTutorProfiles, tutorProfiles), [configured, storedProfiles, tutorProfiles]);
  const reviews = useMemo(() => configured ? storedReviews : mergeById(demoTutorReviews, tutorReviews), [configured, storedReviews, tutorReviews]);
  const tutor = profiles.find((profile) => profile.id === tutorId) ?? null;
  const tutorReviewList = useMemo(() => reviews
    .filter((review) => review.tutorId === tutorId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [reviews, tutorId]);
  const ratingSummary = getTutorRating(tutorId, reviews);
  const verifiedCredentials = tutor ? getTutorVerifiedCredentials(tutor) : [];
  const rankBreakdown = tutor ? getTutorRankBreakdown(tutor, reviews) : null;

  const loadStoredData = useCallback(async () => {
    if (!configured) return;
    setServerLoading(true);
    setServerError("");
    try {
      const response = await fetch("/api/tutors");
      const data = await response.json().catch(() => null) as { mode?: string; error?: string; profiles?: Record<string, unknown>[]; reviews?: Record<string, unknown>[]; credentials?: Record<string, unknown>[] } | null;
      if (!response.ok || data?.mode !== "supabase") throw new Error(data?.error ?? "튜터 정보를 불러오지 못했어요.");
      setStoredProfiles((data.profiles ?? []).map((item) => mapStoredTutorProfile(item, data.credentials ?? [])));
      setStoredReviews((data.reviews ?? []).map(mapStoredTutorReview));
      setServerReady(true);
    } catch (error) {
      setServerReady(false);
      setServerError(error instanceof Error ? error.message : "튜터 정보를 불러오지 못했어요.");
    } finally {
      setServerLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const frame = window.requestAnimationFrame(() => { void loadStoredData(); });
    return () => window.cancelAnimationFrame(frame);
  }, [configured, loadStoredData]);

  useEffect(() => {
    if (!configured) return;
    const ownOrApprovedReviews = tutorReviewList;
    void Promise.all(ownOrApprovedReviews.map(async (review) => {
      const response = await fetch(`/api/tutors/review-media?reviewId=${encodeURIComponent(review.id)}`);
      if (!response.ok) return [review.id, []] as const;
      const payload = await response.json() as { media?: Array<{ id: string; url: string }> };
      return [review.id, payload.media ?? []] as const;
    })).then((entries) => setReviewMedia(Object.fromEntries(entries)));
  }, [configured, tutorReviewList]);

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 3);
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setNotice("JPG, PNG, WebP 사진만 장당 5MB 이하로 선택해 주세요.");
      return;
    }
    setPhotoFiles(files);
    void Promise.all(files.map((file) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    }))).then((urls) => setPhotoDataUrls(urls.filter(Boolean)));
    setNotice(configured ? "사진을 최대 3장까지 선택했어요. 후기 텍스트 접수 뒤 별도로 업로드합니다." : "사진 미리보기를 만들었어요. 실제 서버 업로드는 없습니다.");
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!tutor) return;

    if (!configured && !verifiedLesson) {
      setNotice("검증 수업 확인 체크가 필요합니다.");
      return;
    }

    if (configured && !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(lessonCode.trim().toUpperCase())) {
      setNotice("튜터에게 받은 12자리 수업 확인 코드를 입력해 주세요.");
      return;
    }

    if (content.trim().length < 10) {
      setNotice("후기는 10자 이상 입력해 주세요.");
      return;
    }

    const review: TutorReview = {
      id: `local-tutor-review-${reviewIdPrefix}-${tutorReviews.length + 1}`,
      tutorId: tutor.id,
      authorUserId: "local-review-user",
      rating: Number(rating),
      content: content.trim(),
      photoDataUrl: photoDataUrls[0],
      verifiedLesson,
      isSynthetic: false,
      createdAt: new Date().toISOString(),
    };

    if (configured) {
      const response = await fetch("/api/tutors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "review", data: { tutorId: tutor.id, rating: review.rating, content: review.content, lessonCode: lessonCode.trim().toUpperCase() } }) });
      const payload = await response.json().catch(() => ({})) as { review?: { id?: string }; error?: string };
      if (!response.ok || !payload.review?.id) { setNotice(payload.error ?? "로그인 후 서버에 후기를 저장할 수 있어요."); return; }
      const uploads = await Promise.all(photoFiles.map(async (file) => {
        const form = new FormData();
        form.set("reviewId", payload.review!.id!);
        form.set("file", file);
        const mediaResponse = await fetch("/api/tutors/review-media", { method: "POST", body: form });
        return mediaResponse.ok;
      }));
      await loadStoredData();
      const failed = uploads.filter((uploaded) => !uploaded).length;
      if (failed) setNotice(`텍스트 후기는 심사 대기로 접수됐지만 사진 ${failed}장은 업로드하지 못했어요. 후기 사진 저장소 연결 후 다시 시도해 주세요.`);
      else setNotice(photoFiles.length ? "텍스트 후기와 선택한 사진을 심사 대기로 계정에 저장했어요." : "텍스트 후기를 심사 대기로 계정에 저장했어요.");
    } else addTutorReview(review);
    setRating("5");
    setContent("");
    setVerifiedLesson(false);
    setLessonCode("");
    setPhotoFiles([]);
    setPhotoDataUrls([]);
    if (!configured) setNotice("인증 후기 초안을 이 기기에 체험용으로 저장했어요. 서버 업로드는 아닙니다.");
  };

  const submitContact = async () => {
    if (!configured) { setNotice("체험 모드에서는 문의가 실제로 전송되지 않습니다."); return; }
    if (!tutor || contactMessage.trim().length < 10) { setNotice("10자 이상의 문의 내용을 입력해 주세요."); return; }
    const response = await fetch("/api/tutors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "contact", data: { tutorId: tutor.id, message: contactMessage } }) });
    if (!response.ok) { setNotice("문의 요청을 접수하지 못했어요. 로그인과 저장소 연결을 확인해 주세요."); return; }
    setContactMessage(""); setContactOpen(false); setNotice("문의 요청을 계정에 접수했어요. 답변은 튜터 목록의 내 요청에서 확인할 수 있어요.");
  };

  if (configured && (serverLoading || serverError)) {
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} href="/tutors"><ArrowLeft aria-hidden="true" />튜터 목록</Link>
        <section className={styles.emptyState} role={serverError ? "alert" : "status"} aria-busy={serverLoading}>
          <ShieldCheck aria-hidden="true" />
          <h1>{serverError ? "튜터 정보를 불러오지 못했어요" : "튜터 정보를 불러오는 중이에요"}</h1>
          <p>{serverError || "승인 프로필과 인증 후기를 확인하고 있습니다."}</p>
          {serverError ? <button type="button" onClick={() => void loadStoredData()}>다시 시도</button> : null}
        </section>
      </main>
    );
  }

  if (!serverReady || !tutor) {
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} href="/tutors">
          <ArrowLeft aria-hidden="true" />
          튜터 목록
        </Link>
        <section className={styles.emptyState}>
          <UserRound aria-hidden="true" />
          <h1>튜터를 찾을 수 없어요</h1>
          <p>삭제되었거나 이 기기에 저장된 체험 프로필일 수 있습니다.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/tutors">
        <ArrowLeft aria-hidden="true" />
        튜터 목록
      </Link>

      <section className={styles.hero} aria-labelledby="tutor-title">
        <div className={styles.profileImage} aria-label="튜터 프로필 사진">
          {tutor.photoUrl ? (
            <Image src={tutor.photoUrl} alt="" width={104} height={104} unoptimized />
          ) : (
            <UserRound aria-hidden="true" />
          )}
        </div>
        <div className={styles.heroText}>
          <div className={styles.nameRow}>
            <div>
              <p className={styles.kicker}>동네 튜터</p>
              <h1 id="tutor-title">{tutor.displayName}</h1>
            </div>
            {tutor.isSynthetic ? <span className={styles.pending}>체험용 합성 데이터</span> : <span className={styles.verified}>계정 등록 데이터</span>}
            {tutor.verificationLevel === "TRIAL" ? (
              <span className={styles.verified}>
                <BadgeCheck aria-hidden="true" />
                체험 인증 튜터
              </span>
            ) : tutor.verified ? (
              <span className={styles.verified}>
                <BadgeCheck aria-hidden="true" />
                EDU톡 인증
              </span>
            ) : (
              <span className={styles.pending}>{(tutor.credentials ?? []).length > 0 ? "인증 심사 대기" : "인증 미신청"}</span>
            )}
          </div>
          <p>{tutor.introduction}</p>
          <dl className={styles.heroMetrics}>
            <div>
              <dt>시간당 비용</dt>
              <dd>{formatPrice(tutor.pricePerHour)}</dd>
            </div>
            <div>
              <dt>응답률</dt>
              <dd>{tutor.responseRate}%</dd>
            </div>
            <div>
              <dt>EDU톡 인증 후기</dt>
              <dd>{ratingSummary.score ? `${ratingSummary.score.toFixed(1)}점 · ${ratingSummary.count}건` : "대기 중"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.contactBox} aria-label="튜터 문의">
        <div>
          <p className={styles.kicker}>{configured ? "계정 문의" : "체험 문의"}</p>
          <h2>{configured ? "튜터에게 수업 문의를 남겨요" : "문의하기 버튼은 흐름만 보여줍니다"}</h2>
          <p>{configured ? "요청은 계정에 저장되고 답변은 튜터 목록의 내 요청에서 확인할 수 있어요. 연락처 전달은 아직 연결되지 않았습니다." : "채팅, 결제, 연락처 전달은 아직 연결되지 않았습니다."}</p>
        </div>
        <button type="button" onClick={() => configured ? setContactOpen((open) => !open) : setNotice("문의하기는 체험 버튼입니다. 실제 메시지는 전송되지 않았습니다.")}>
          <MessageCircle aria-hidden="true" />
          {configured ? "문의 작성" : "문의하기 체험"}
        </button>
        {configured && contactOpen ? <div className={styles.contactForm}><label>문의 내용<textarea value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} minLength={10} maxLength={1000} /></label><button type="button" onClick={submitContact}>문의 요청 접수</button></div> : null}
      </section>

      <p className={styles.notice} role="status">
        <ShieldCheck aria-hidden="true" />
        {notice}
      </p>

      <section className={styles.verificationSection} aria-labelledby="verification-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>EDU톡 인증</p>
            <h2 id="verification-title">검증된 항목</h2>
          </div>
          <span>{verifiedCredentials.length}개 확인</span>
        </div>
        {verifiedCredentials.length > 0 ? (
          <div className={styles.credentialList}>
            {verifiedCredentials.map((credential) => (
              <article className={styles.credentialCard} key={`${credential.type}-${credential.label}`}>
                <BadgeCheck aria-hidden="true" />
                <div>
                  <strong>{credential.label}</strong>
                  <p>{credential.issuer ?? "EDU톡 확인"}{credential.value ? ` · ${credential.value}` : ""}</p>
                  {credential.expiresAt ? <small>유효 확인일 {getReviewDate(credential.expiresAt)}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.verificationEmpty}>아직 공개 가능한 검증 항목이 없습니다. 심사 중인 서류와 개인정보는 공개하지 않습니다.</p>
        )}
        <p className={styles.privateNote}>신분증 번호와 문서 원본은 표시하지 않으며, 실제 문서는 서버 연결 후 비공개 심사합니다.</p>
      </section>

      {rankBreakdown ? (
        <section className={styles.rankSection} aria-labelledby="rank-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.kicker}>추천 순위 산식</p>
              <h2 id="rank-title">광고비 없이 계산합니다</h2>
            </div>
            <span>총 {rankBreakdown.total.toFixed(1)}점</span>
          </div>
          <dl className={styles.rankGrid}>
            <div><dt>EDU톡 인증 후기 평점</dt><dd>{rankBreakdown.reviewRating.toFixed(1)} / 60점</dd></div>
            <div><dt>인증 후기 수</dt><dd>{rankBreakdown.reviewVolume.toFixed(1)} / 20점</dd></div>
            <div><dt>응답률</dt><dd>{rankBreakdown.responseRate.toFixed(1)} / 15점</dd></div>
            <div><dt>검증된 인증 항목</dt><dd>+{rankBreakdown.verification.toFixed(1)} / 5점</dd></div>
          </dl>
          <p className={styles.rankNote}>광고비와 유료 노출은 추천 순위에 반영하지 않습니다.</p>
        </section>
      ) : null}

      <section className={styles.infoGrid}>
        <article className={styles.infoCard}>
          <MapPin aria-hidden="true" />
          <h2>활동지역</h2>
          <div className={styles.tagRow}>
            {tutor.zones.map((zone) => (
              <span key={zone}>{zone}</span>
            ))}
          </div>
        </article>

        <article className={styles.infoCard}>
          <Clock3 aria-hidden="true" />
          <h2>과목과 학년</h2>
          <div className={styles.tagRow}>
            {tutor.subjects.map((subject) => (
              <span key={subject}>{subject}</span>
            ))}
            {tutor.targetGrades.map((grade) => (
              <span key={grade}>{grade}</span>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.reviewSection} aria-labelledby="review-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>인증 후기</p>
            <h2 id="review-list-title">수업 확인 후 남긴 후기</h2>
          </div>
          <span>{tutorReviewList.length}건</span>
        </div>

        {tutorReviewList.length === 0 ? (
          <div className={styles.emptyReview}>
            <Star aria-hidden="true" />
            <p>아직 등록된 인증 후기가 없어요.</p>
          </div>
        ) : (
          <div className={styles.reviewList}>
            {tutorReviewList.map((review) => (
              <article className={styles.reviewCard} key={review.id}>
                <div className={styles.reviewTop}>
                  <strong>{review.rating.toFixed(1)}점</strong>
                  <span>
                    <CheckCircle2 aria-hidden="true" />
                    검증 수업 확인
                  </span>
                </div>
                <p>{review.content}</p>
                {review.photoDataUrl && !configured ? (
                  <Image
                    className={styles.reviewImage}
                    src={review.photoDataUrl}
                    alt="후기 사진 미리보기"
                    width={720}
                    height={480}
                    unoptimized
                  />
                ) : null}
                {configured && (reviewMedia[review.id] ?? []).length ? <div className={styles.reviewMedia}>{reviewMedia[review.id].map((media) => <Image className={styles.reviewImage} src={media.url} alt="승인된 후기 사진" width={720} height={480} unoptimized key={media.id} />)}</div> : null}
                <time dateTime={review.createdAt}>{getReviewDate(review.createdAt)}</time>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.formSection} aria-labelledby="review-form-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>후기 등록</p>
            <h2 id="review-form-title">사진 포함 인증 후기 남기기</h2>
          </div>
          <Camera aria-hidden="true" />
        </div>

        <form className={styles.reviewForm} onSubmit={submitReview}>
          <label>
            <span>평점</span>
            <select value={rating} onChange={(event) => setRating(event.target.value)}>
              <option value="5">5점</option>
              <option value="4.5">4.5점</option>
              <option value="4">4점</option>
              <option value="3.5">3.5점</option>
              <option value="3">3점</option>
            </select>
          </label>

          <label>
            <span>후기 내용</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="수업 방식, 아이 반응, 피드백 품질을 적어주세요." />
          </label>

          <label className={styles.fileLabel}>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotoChange} />
            <span>
              <ImagePlus aria-hidden="true" />
              후기 사진 선택
            </span>
            <small>{configured ? "JPG, PNG, WebP만 장당 5MB 이하로 최대 3장. 텍스트 후기 접수 후 별도 업로드합니다." : "FileReader로 로컬 미리보기만 만들며 서버 업로드는 없습니다."}</small>
          </label>

          {photoDataUrls.length ? <div className={styles.previewList}>{photoDataUrls.map((photoDataUrl, index) => <div className={styles.previewBox} key={photoDataUrl}><Image src={photoDataUrl} alt={`선택한 후기 사진 미리보기 ${index + 1}`} width={720} height={480} unoptimized /><button type="button" onClick={() => { setPhotoFiles((files) => files.filter((_, fileIndex) => fileIndex !== index)); setPhotoDataUrls((urls) => urls.filter((_, urlIndex) => urlIndex !== index)); }} aria-label={`후기 사진 ${index + 1} 제거`}><X aria-hidden="true" /></button></div>)}</div> : null}

          {configured ? <label><span>1회용 수업 확인 코드</span><input className={styles.lessonCodeInput} value={lessonCode} onChange={(event) => setLessonCode(event.target.value.toUpperCase())} maxLength={14} autoCapitalize="characters" placeholder="ABCD-2345-EFGH" /><small>인증 튜터가 발급한 코드를 한 번만 사용할 수 있어요. 코드 원문은 서버에 저장되지 않습니다.</small></label> : <label className={styles.checkLabel}><input type="checkbox" checked={verifiedLesson} onChange={(event) => setVerifiedLesson(event.target.checked)} /><span>검증 수업 확인 후 작성하는 후기입니다.</span></label>}

          <p className={styles.formNote}>{configured ? "유효한 1회용 코드가 확인된 후기만 심사 대기로 접수됩니다. 사진 업로드 실패는 텍스트 접수와 별도로 알려드리며, 승인 전 사진은 작성자만 볼 수 있습니다." : "후기와 사진은 서버로 전송되지 않고 브라우저에 체험용으로 저장됩니다."}</p>

          <button type="submit" className={styles.submitButton}>
            <Upload aria-hidden="true" />
            {configured ? "후기 접수 및 사진 업로드" : "후기 체험 저장"}
          </button>
        </form>
      </section>
    </main>
  );
}
