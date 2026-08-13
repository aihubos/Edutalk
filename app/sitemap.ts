import type { MetadataRoute } from "next";
import { getPublicCanonicalInstitutions } from "@/lib/canonical-institutions";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  if (!baseUrl || process.env.NEXT_PUBLIC_DATA_MODE !== "production" || !isSupabaseConfigured()) return [];

  const publicPaths = ["", "/discover", "/rankings", "/tutors", "/policies", "/legal/terms", "/legal/privacy", "/legal/community", "/support", "/account-deletion"];
  const { institutions } = await getPublicCanonicalInstitutions();
  const currentDate = new Date();

  return [
    ...publicPaths.map((path) => ({ url: `${baseUrl}${path}`, lastModified: currentDate, changeFrequency: path === "" ? "daily" as const : "weekly" as const })),
    ...institutions.map((institution) => ({ url: `${baseUrl}/institutions/${institution.publicSlug}`, lastModified: institution.checkedAt ? new Date(institution.checkedAt) : currentDate, changeFrequency: "weekly" as const })),
  ];
}
