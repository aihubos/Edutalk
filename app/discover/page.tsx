import Link from "next/link";
import { Filter, ListFilter, MapPinned, SearchX } from "lucide-react";
import { InstitutionCard } from "@/components/institution-card";
import { InstitutionCoordinateMap } from "@/components/institution-coordinate-map";
import { SearchBar } from "@/components/search-bar";
import { SavedSearchPanel } from "@/components/saved-search-panel";
import { getPublicCanonicalInstitutions, type CanonicalInstitution } from "@/lib/canonical-institutions";
import { institutions } from "@/lib/demo-data";
import { institutionTypeLabels, zoneLabels } from "@/lib/labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Institution, InstitutionType, ServiceZone, SortOption } from "@/lib/types";
import styles from "./discover.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

interface DiscoverPageProps {
  searchParams?: Promise<SearchParams>;
}

const institutionTypes: InstitutionType[] = ["CHILDCARE", "KINDERGARTEN", "ACADEMY", "TUTORING"];
const zones: ServiceZone[] = ["ALL", "DONGTAN_1", "DONGTAN_2"];
const sortOptions: SortOption[] = ["RECOMMENDED", "DISTANCE", "RATING", "REVIEWS", "PRICE"];
type CanonicalSort = "NAME" | "CHECKED";
const canonicalSortOptions: CanonicalSort[] = ["NAME", "CHECKED"];

const sortLabels: Record<SortOption, string> = {
  RECOMMENDED: "추천순",
  DISTANCE: "거리순",
  RATING: "평점순",
  REVIEWS: "후기 많은순",
  PRICE: "비용 낮은순",
};
const canonicalSortLabels: Record<CanonicalSort, string> = { NAME: "이름순", CHECKED: "최근 확인일순" };

const getSingleParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const isInstitutionType = (value: string): value is InstitutionType =>
  institutionTypes.includes(value as InstitutionType);

const isServiceZone = (value: string): value is ServiceZone => zones.includes(value as ServiceZone);

const isSortOption = (value: string): value is SortOption =>
  sortOptions.includes(value as SortOption);

const isCanonicalSort = (value: string): value is CanonicalSort =>
  canonicalSortOptions.includes(value as CanonicalSort);

const isEnabledFilter = (value: string) => value === "true";

const getParentRating = (institution: Institution) => {
  const rating = institution.ratings.find((item) => item.role === "PARENT");
  return rating?.isPublic && rating.score !== null ? rating.score : 0;
};

const getParentReviewCount = (institution: Institution) =>
  institution.ratings.find((item) => item.role === "PARENT")?.count ?? 0;

const buildDiscoverHref = (
  current: {
    q: string;
    zone: ServiceZone;
    type: InstitutionType | "ALL";
    sort: SortOption;
    pickup: boolean;
    trial: boolean;
  },
  next: Partial<{
    q: string;
    zone: ServiceZone;
    type: InstitutionType | "ALL";
    sort: SortOption;
    pickup: boolean;
    trial: boolean;
  }>,
) => {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();

  if (merged.q) params.set("q", merged.q);
  if (merged.zone !== "ALL") params.set("zone", merged.zone);
  if (merged.type !== "ALL") params.set("type", merged.type);
  if (merged.sort !== "RECOMMENDED") params.set("sort", merged.sort);
  if (merged.pickup) params.set("pickup", "true");
  if (merged.trial) params.set("trial", "true");

  const queryString = params.toString();
  return queryString ? "/discover?" + queryString : "/discover";
};

const buildCanonicalDiscoverHref = (
  current: { q: string; zone: ServiceZone; type: InstitutionType | "ALL"; sort: CanonicalSort },
  next: Partial<{ q: string; zone: ServiceZone; type: InstitutionType | "ALL"; sort: CanonicalSort }>,
) => {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.zone !== "ALL") params.set("zone", merged.zone);
  if (merged.type !== "ALL") params.set("type", merged.type);
  if (merged.sort !== "NAME") params.set("sort", merged.sort);
  const queryString = params.toString();
  return queryString ? `/discover?${queryString}` : "/discover";
};

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const params = (await searchParams) ?? {};
  const q = getSingleParam(params.q).trim();
  const rawType = getSingleParam(params.type);
  const rawZone = getSingleParam(params.zone);
  const rawSort = getSingleParam(params.sort);
  const selectedPickup = isEnabledFilter(getSingleParam(params.pickup));
  const selectedTrial = isEnabledFilter(getSingleParam(params.trial));
  const selectedType: InstitutionType | "ALL" = isInstitutionType(rawType) ? rawType : "ALL";
  const selectedZone: ServiceZone = isServiceZone(rawZone) ? rawZone : "ALL";
  const accountMode = isSupabaseConfigured();

  if (accountMode) {
    const selectedCanonicalSort: CanonicalSort = isCanonicalSort(rawSort) ? rawSort : "NAME";
    const { institutions: canonicalInstitutions, error } = await getPublicCanonicalInstitutions();
    const filteredCanonicalInstitutions = canonicalInstitutions.filter((institution) => {
      const keyword = q.toLowerCase();
      const matchesKeyword = !keyword || [institution.name, institution.address].join(" ").toLowerCase().includes(keyword);
      const matchesType = selectedType === "ALL" || institution.type === selectedType;
      const matchesZone = selectedZone === "ALL" || institution.zone === selectedZone;
      return matchesKeyword && matchesType && matchesZone;
    });
    const sortedCanonicalInstitutions = [...filteredCanonicalInstitutions].sort((a, b) => {
      if (selectedCanonicalSort === "CHECKED") {
        const checkedGap = (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "");
        if (checkedGap !== 0) return checkedGap;
      }
      return a.name.localeCompare(b.name, "ko");
    });

    return <CanonicalDiscoverPage institutions={sortedCanonicalInstitutions} error={error} q={q} selectedType={selectedType} selectedZone={selectedZone} selectedSort={selectedCanonicalSort} />;
  }

  const selectedSort: SortOption = isSortOption(rawSort) ? rawSort : "RECOMMENDED";

  const filteredInstitutions = institutions.filter((institution) => {
    const keyword = q.toLowerCase();
    const matchesKeyword =
      !keyword ||
      [
        institution.name,
        institution.neighborhood,
        institution.address,
        ...institution.tags,
        ...institution.subjects,
        ...institution.ageGroups,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    const matchesType = selectedType === "ALL" || institution.type === selectedType;
    const matchesZone = selectedZone === "ALL" || institution.zone === selectedZone;
    const matchesPickup = !selectedPickup || institution.pickupAvailable;
    const matchesTrial = !selectedTrial || institution.trialClassAvailable;

    return matchesKeyword && matchesType && matchesZone && matchesPickup && matchesTrial;
  });

  const sortedInstitutions = [...filteredInstitutions].sort((a, b) => {
    if (selectedSort === "DISTANCE") return a.distanceM - b.distanceM;
    if (selectedSort === "RATING") return getParentRating(b) - getParentRating(a);
    if (selectedSort === "REVIEWS") return getParentReviewCount(b) - getParentReviewCount(a);
    if (selectedSort === "PRICE") {
      const aFee = a.monthlyFee ?? Number.POSITIVE_INFINITY;
      const bFee = b.monthlyFee ?? Number.POSITIVE_INFINITY;
      return aFee - bFee;
    }

    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    const ratingGap = getParentRating(b) - getParentRating(a);
    if (ratingGap !== 0) return ratingGap;
    return a.distanceM - b.distanceM;
  });

  const current = {
    q,
    zone: selectedZone,
    type: selectedType,
    sort: selectedSort,
    pickup: selectedPickup,
    trial: selectedTrial,
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="discover-title">
        <span className={styles.demoBadge}>체험용 데이터</span>
        <div>
          <p className={styles.kicker}>동탄 교육기관 찾기</p>
          <h1 id="discover-title">조건에 맞는 기관을 바로 좁혀보세요</h1>
          <p>
            기관명, 동네, 과목, 유형을 함께 검색해요. 평점·후기 정렬은 학부모 인증 후기 기준이에요.
          </p>
        </div>
        <SearchBar
          initialValue={q}
          zone={selectedZone}
          type={selectedType}
          sort={selectedSort}
          pickup={selectedPickup}
          trial={selectedTrial}
          placeholder="예: 미래수학, 청계동, 영어"
          submitLabel="검색"
        />
      </section>

      <section className={styles.filterPanel} aria-labelledby="filter-title">
        <div className={styles.panelTitle}>
          <ListFilter size={18} aria-hidden="true" />
          <h2 id="filter-title">검색 조건</h2>
        </div>

        <form className={styles.filterForm} action="/discover">
          <input type="hidden" name="q" value={q} />
          {selectedPickup ? <input type="hidden" name="pickup" value="true" /> : null}
          {selectedTrial ? <input type="hidden" name="trial" value="true" /> : null}

          <label>
            <span>지역</span>
            <select name="zone" defaultValue={selectedZone}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zoneLabels[zone]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>유형</span>
            <select name="type" defaultValue={selectedType}>
              <option value="ALL">전체 유형</option>
              {institutionTypes.map((type) => (
                <option key={type} value={type}>
                  {institutionTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>정렬</span>
            <select name="sort" defaultValue={selectedSort}>
              {sortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {sortLabels[sort]}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">
            <Filter size={16} aria-hidden="true" />
            적용
          </button>
        </form>

        <div className={styles.typeChips} aria-label="유형 빠른 필터">
          <Link
            href={buildDiscoverHref(current, { type: "ALL" })}
            data-active={selectedType === "ALL"}
          >
            전체
          </Link>
          {institutionTypes.map((type) => (
            <Link
              key={type}
              href={buildDiscoverHref(current, { type })}
              data-active={selectedType === type}
            >
              {institutionTypeLabels[type]}
            </Link>
          ))}
        </div>

        <div className={styles.quickFilters} aria-label="체험 빠른 필터">
          <p>체험용 빠른 조건</p>
          <div>
            <Link
              href={buildDiscoverHref(current, { pickup: !selectedPickup })}
              data-active={selectedPickup}
            >
              통학차량
            </Link>
            <Link
              href={buildDiscoverHref(current, { trial: !selectedTrial })}
              data-active={selectedTrial}
            >
              체험수업
            </Link>
          </div>
        </div>
      </section>

      <SavedSearchPanel current={{ query: q, zone: selectedZone, institutionType: selectedType, sort: selectedSort, pickup: selectedPickup, trial: selectedTrial }} />

      <section className={styles.resultSection} aria-labelledby="result-title">
        <div className={styles.resultHeader}>
          <div>
            <p className={styles.kicker}>검색 결과</p>
            <h2 id="result-title">{sortedInstitutions.length}곳을 찾았어요</h2>
          </div>
          <Link href="/discover">초기화</Link>
        </div>

        {sortedInstitutions.length > 0 ? (
          <InstitutionCoordinateMap items={sortedInstitutions.map((institution) => ({ id: institution.id, name: institution.name, type: institutionTypeLabels[institution.type], address: institution.address, latitude: institution.coordinates.lat, longitude: institution.coordinates.lng }))}>
            <div className={styles.resultList}>
              {sortedInstitutions.map((institution) => (
                <div id={`coordinate-list-${institution.id}`} data-coordinate-list-item={institution.id} tabIndex={-1} key={institution.id}><InstitutionCard institution={institution} /></div>
              ))}
            </div>
          </InstitutionCoordinateMap>
        ) : (
          <div className={styles.emptyState} role="status">
            <SearchX size={32} aria-hidden="true" />
            <h3>조건에 맞는 기관이 없어요</h3>
            <p>검색어를 줄이거나 지역과 유형을 전체로 바꿔 다시 확인해보세요.</p>
            <Link href="/discover">전체 목록 보기</Link>
          </div>
        )}
      </section>
    </main>
  );
}

function CanonicalDiscoverPage({ institutions, error, q, selectedType, selectedZone, selectedSort }: { institutions: CanonicalInstitution[]; error: string | null; q: string; selectedType: InstitutionType | "ALL"; selectedZone: ServiceZone; selectedSort: CanonicalSort }) {
  const current = { q, zone: selectedZone, type: selectedType, sort: selectedSort };
  return <main className={styles.page}>
    <section className={styles.hero} aria-labelledby="discover-title">
      <span className={styles.accountBadge}>공개 기관 정보</span>
      <div><p className={styles.kicker}>기관 찾기</p><h1 id="discover-title">공개 확인된 기관을 찾아보세요</h1><p>상용 모드에서는 공개 canonical 기관 정보만 표시합니다. 이름·최근 확인일 정렬과 현재 위치 기준 거리를 제공하며, 확인되지 않은 정보는 표시하지 않습니다.</p></div>
      <SearchBar initialValue={q} zone={selectedZone} type={selectedType} sort={selectedSort} placeholder="예: 기관명, 주소" submitLabel="검색" />
    </section>

    <section className={styles.filterPanel} aria-labelledby="filter-title">
      <div className={styles.panelTitle}><ListFilter size={18} aria-hidden="true" /><h2 id="filter-title">검색 조건</h2></div>
      <form className={styles.filterForm} action="/discover"><input type="hidden" name="q" value={q} /><label><span>지역</span><select name="zone" defaultValue={selectedZone}>{zones.map((zone) => <option key={zone} value={zone}>{zoneLabels[zone]}</option>)}</select></label><label><span>유형</span><select name="type" defaultValue={selectedType}><option value="ALL">전체 유형</option>{institutionTypes.map((type) => <option key={type} value={type}>{institutionTypeLabels[type]}</option>)}</select></label><label><span>정렬</span><select name="sort" defaultValue={selectedSort}>{canonicalSortOptions.map((sort) => <option key={sort} value={sort}>{canonicalSortLabels[sort]}</option>)}</select></label><button type="submit"><Filter size={16} aria-hidden="true" />적용</button></form>
      <div className={styles.typeChips} aria-label="유형 빠른 필터"><Link href={buildCanonicalDiscoverHref(current, { type: "ALL" })} data-active={selectedType === "ALL"}>전체</Link>{institutionTypes.map((type) => <Link key={type} href={buildCanonicalDiscoverHref(current, { type })} data-active={selectedType === type}>{institutionTypeLabels[type]}</Link>)}</div>
      <p className={styles.canonicalFilterNotice}>통학차량·체험수업은 기관별 공개 승인 정보가 있어도 목록 필터 기준으로 비교하지 않습니다. 상세에서 출처·확인일과 함께 확인해 주세요.</p>
    </section>

    <SavedSearchPanel current={{ query: q, zone: selectedZone, institutionType: selectedType, sort: selectedSort, pickup: false, trial: false }} />

    <section className={styles.resultSection} aria-labelledby="result-title">
      <div className={styles.resultHeader}><div><p className={styles.kicker}>공개 기관 결과</p><h2 id="result-title">{institutions.length}곳을 찾았어요</h2></div><Link href="/discover">초기화</Link></div>
      {error ? <div className={styles.emptyState} role="alert"><SearchX size={32} aria-hidden="true" /><h3>공개 기관 정보를 불러오지 못했어요</h3><p>{error}</p><Link href="/discover">다시 확인</Link></div> : institutions.length > 0 ? <><div className={styles.locationControl}><button type="button" id="canonical-location-button"><MapPinned size={17} aria-hidden="true" />현재 위치 기준 거리 보기</button><p id="canonical-location-status">위치 권한을 허용하면 좌표가 있는 기관만 가까운 순으로 정렬합니다.</p></div><InstitutionCoordinateMap items={institutions.map((institution) => ({ id: institution.id, name: institution.name, type: institutionTypeLabels[institution.type], address: institution.address, latitude: institution.latitude, longitude: institution.longitude }))}><div className={styles.canonicalList} id="canonical-institution-list">{institutions.map((institution) => <CanonicalInstitutionRow key={institution.id} institution={institution} />)}</div></InstitutionCoordinateMap><script dangerouslySetInnerHTML={{ __html: canonicalDistanceScript }} /></> : <div className={styles.emptyState} role="status"><SearchX size={32} aria-hidden="true" /><h3>공개 기관 정보가 아직 없어요</h3><p>상용 데이터가 등록되면 이 목록에서 확인할 수 있어요. 체험 기관 데이터는 함께 표시하지 않습니다.</p></div>}
    </section>
  </main>;
}

function CanonicalInstitutionRow({ institution }: { institution: CanonicalInstitution }) {
  const hasCoordinates = institution.latitude !== null && institution.longitude !== null;
  return <Link id={`coordinate-list-${institution.id}`} className={styles.canonicalRow} data-coordinate-list-item={institution.id} data-latitude={institution.latitude ?? ""} data-longitude={institution.longitude ?? ""} data-has-coordinates={hasCoordinates} href={`/institutions/${institution.publicSlug}`}><span>{institutionTypeLabels[institution.type]}</span><div><strong>{institution.name}</strong><small>{institution.address}</small></div><em data-distance>거리 확인 전</em><small className={styles.canonicalChecked}>{institution.checkedAt ? `최근 확인 ${institution.checkedAt.slice(0, 10)}` : "최근 확인일 미등록"}</small></Link>;
}

const canonicalDistanceScript = `(() => {
  const button = document.getElementById('canonical-location-button');
  const status = document.getElementById('canonical-location-status');
  const list = document.getElementById('canonical-institution-list');
  if (!button || !status || !list) return;
  const distance = (a,b,c,d) => { const r=6371000; const p=Math.PI/180; const x=(c-a)*p; const y=(d-b)*p; const h=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2; return 2*r*Math.asin(Math.sqrt(h)); };
  button.addEventListener('click', () => {
    if (!navigator.geolocation) { status.textContent='이 브라우저에서는 현재 위치를 사용할 수 없어요.'; return; }
    status.textContent='현재 위치 권한을 요청하고 있어요.';
    navigator.geolocation.getCurrentPosition((position) => {
      const rows = Array.from(list.querySelectorAll('[data-has-coordinates]'));
      let available = 0;
      rows.forEach((row) => { const lat=Number(row.dataset.latitude), lng=Number(row.dataset.longitude); const label=row.querySelector('[data-distance]'); if (!Number.isFinite(lat)||!Number.isFinite(lng)) { if(label) label.textContent='좌표 미등록'; row.dataset.distance=''; return; } const meters=distance(position.coords.latitude,position.coords.longitude,lat,lng); row.dataset.distance=String(meters); if(label) label.textContent=meters<1000 ? Math.round(meters)+'m' : (meters/1000).toFixed(1)+'km'; available += 1; });
      rows.sort((a,b) => { const x=Number(a.dataset.distance), y=Number(b.dataset.distance); return Number.isFinite(x)&&Number.isFinite(y) ? x-y : Number.isFinite(x) ? -1 : 1; }).forEach((row) => list.appendChild(row));
      status.textContent=available ? '현재 위치 기준 직선거리입니다. 좌표가 없는 기관은 목록 뒤에 남아요.' : '거리 계산에 쓸 공개 기관 좌표가 아직 없어요.';
    }, () => { status.textContent='위치 권한이 거절되었거나 현재 위치를 확인하지 못했어요. 거리 정렬은 적용하지 않았습니다.'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
})();`;
