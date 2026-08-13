import "server-only";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const operatorRoles = new Set(["DATA_OPERATOR", "ADMIN"]);

export const publicInformationInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(3000),
  audienceRoles: z.array(z.enum(["PARENT", "STUDENT", "TEACHER"])).min(1).max(3),
  category: z.enum(["POLICY", "EVENT", "PROGRAM"]),
  organizer: z.string().trim().min(1).max(160),
  applicationPeriod: z.string().trim().min(1).max(160),
  status: z.enum(["OPEN", "ONGOING", "CLOSED"]),
  region: z.string().trim().min(1).max(120),
  sourceUrl: z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "공식 원문은 HTTPS 주소만 사용할 수 있어요."),
  sourceLabel: z.string().trim().min(1).max(160),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "기준일은 YYYY-MM-DD 형식이어야 해요.").refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "기준일을 다시 확인해 주세요."),
  isPublic: z.boolean(),
});

export const publicInformationUpdateSchema = publicInformationInputSchema.extend({ id: z.string().uuid() });
export const publicInformationDeleteSchema = z.object({ id: z.string().uuid() });

export type PublicInformationInput = z.infer<typeof publicInformationInputSchema>;

export function toPublicInformationRow(input: PublicInformationInput) {
  return {
    title: input.title,
    summary: input.summary,
    audience_roles: input.audienceRoles,
    category: input.category,
    organizer: input.organizer,
    application_period: input.applicationPeriod,
    status: input.status,
    region: input.region,
    source_url: input.sourceUrl,
    source_label: input.sourceLabel,
    source_date: input.sourceDate,
    is_public: input.isPublic,
  };
}

export function toPublicInformationItem(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    audienceRoles: Array.isArray(row.audience_roles) ? row.audience_roles.filter((role): role is "PARENT" | "STUDENT" | "TEACHER" => role === "PARENT" || role === "STUDENT" || role === "TEACHER") : [],
    category: row.category === "EVENT" || row.category === "PROGRAM" ? row.category : "POLICY",
    organizer: String(row.organizer ?? ""),
    applicationPeriod: String(row.application_period ?? ""),
    status: row.status === "OPEN" || row.status === "CLOSED" ? row.status : "ONGOING",
    region: String(row.region ?? ""),
    sourceUrl: String(row.source_url ?? ""),
    sourceLabel: String(row.source_label ?? ""),
    sourceDate: String(row.source_date ?? ""),
    isPublic: row.is_public === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function publicInformationOperatorSession() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, response: { error: "Supabase 계정 서버가 설정되지 않았어요.", status: 503 } };

  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !userId) return { supabase, response: { error: "로그인이 필요해요.", status: 401 } };

  const { data: roles, error: rolesError } = await supabase.from("operator_roles").select("role").eq("user_id", userId);
  if (rolesError) return { supabase, response: { error: "운영자 권한을 확인하지 못했어요.", status: 500 } };
  if (!(roles ?? []).some((item) => operatorRoles.has(item.role))) return { supabase, response: { error: "정책·행사 운영 권한이 없습니다.", status: 403 } };

  return { supabase, response: null };
}
