import type { Institution } from "@/lib/types";

export type ExternalReviewPlatformId =
  | "edutalk-authenticated"
  | "naver-blog"
  | "naver-map"
  | "kakao-map"
  | "instagram";

interface ExternalReviewPlatform {
  id: ExternalReviewPlatformId;
  name: string;
  description: string;
  linkLabel: string;
  isExternal: boolean;
}

interface ExternalReviewMetric {
  rating: number | null;
  reviewCount: number | null;
  isSynthetic: true;
}

export interface ExternalReviewSource extends ExternalReviewPlatform, ExternalReviewMetric {
  href: string;
}

export type CanonicalExternalReviewSource = {
  platform: string;
  sourceLabel: string;
  originalUrl: string | null;
  checkedAt: string;
  status: "LINK_ONLY" | "UNAVAILABLE";
  isPublic: boolean;
};

const platforms: readonly ExternalReviewPlatform[] = [
  {
    id: "edutalk-authenticated",
    name: "EDU톡 인증 후기",
    description: "EDU톡 안에서 관계 확인 후 남긴 후기만 모아 보여줘요.",
    linkLabel: "후기 섹션 보기",
    isExternal: false,
  },
  {
    id: "naver-blog",
    name: "네이버 블로그",
    description: "학부모 경험담과 방문 후기를 블로그 검색으로 확인해요.",
    linkLabel: "블로그 검색",
    isExternal: true,
  },
  {
    id: "naver-map",
    name: "네이버 지도",
    description: "지도에 공개된 위치, 영업 정보, 방문자 반응을 확인해요.",
    linkLabel: "네이버 지도 열기",
    isExternal: true,
  },
  {
    id: "kakao-map",
    name: "카카오맵",
    description: "카카오맵에서 길찾기와 원문 후기를 함께 확인해요.",
    linkLabel: "카카오맵 열기",
    isExternal: true,
  },
  {
    id: "instagram",
    name: "인스타그램",
    description: "기관명과 주소 기준으로 공개 게시물을 검색해요.",
    linkLabel: "인스타그램 검색",
    isExternal: true,
  },
] as const;

const emptySyntheticMetric: ExternalReviewMetric = {
  rating: null,
  reviewCount: null,
  isSynthetic: true,
};

const getInstitutionQuery = (institution: Institution) =>
  encodeURIComponent(institution.name + " " + institution.address);

const getEdutalkMetric = (institution: Institution): ExternalReviewMetric => {
  void institution;
  return {
    rating: null,
    reviewCount: null,
    isSynthetic: true,
  };
};

const getSourceHref = (platformId: ExternalReviewPlatformId, institution: Institution) => {
  const query = getInstitutionQuery(institution);

  if (platformId === "edutalk-authenticated") return "#edutalk-reviews";
  if (platformId === "naver-blog") {
    return "https://search.naver.com/search.naver?where=blog&query=" + query;
  }
  if (platformId === "naver-map") return "https://map.naver.com/p/search/" + query;
  if (platformId === "kakao-map") return "https://map.kakao.com/?q=" + query;

  return "https://www.instagram.com/explore/search/keyword/?q=" + query;
};

export const getExternalReviewSources = (institution: Institution): ExternalReviewSource[] =>
  platforms.map((platform) => {
    const metric =
      platform.id === "edutalk-authenticated" ? getEdutalkMetric(institution) : emptySyntheticMetric;

    return {
      ...platform,
      ...metric,
      href: getSourceHref(platform.id, institution),
    };
  });

export const isSafeExternalReviewUrl = (value: string) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
