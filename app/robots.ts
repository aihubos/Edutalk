import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const production = process.env.NEXT_PUBLIC_DATA_MODE === "production";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!production || !baseUrl) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/discover", "/institutions/", "/rankings", "/tutors", "/policies", "/legal/", "/support", "/account-deletion"],
      disallow: ["/api/", "/admin", "/activity", "/messages", "/my", "/onboarding", "/review", "/school-record", "/student-records", "/subscription", "/teacher-log", "/trust-center", "/institution-manager"],
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
