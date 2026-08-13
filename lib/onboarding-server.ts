import { z } from "zod";

const roleSchema = z.enum(["PARENT", "STUDENT", "TEACHER"]);

const requiredProfileFields = {
  STUDENT: ["gradeRange", "interests", "maxDistance", "preferredTime"],
  PARENT: ["childGradeRange", "interests", "budget", "commuteDistance"],
  TEACHER: ["occupation", "institutionType", "preferredArea"],
} as const;

export const onboardingPayloadSchema = z.object({
  ageBand: z.enum(["UNDER_14", "FOURTEEN_PLUS", "ADULT"]),
  role: roleSchema,
  zone: z.enum(["ALL", "DONGTAN_1", "DONGTAN_2"]),
  consentVersion: z.string().trim().min(1).max(80).optional(),
  consentVersions: z.object({
    terms: z.string().trim().min(1).max(80),
    privacy: z.string().trim().min(1).max(80),
    community: z.string().trim().min(1).max(80),
  }),
  consentedAt: z.string().datetime(),
  roleProfile: z.object({
    role: roleSchema,
    fields: z.record(z.string().max(60), z.string().trim().max(200)).default({}),
  }),
}).superRefine((value, context) => {
  if (value.roleProfile.role !== value.role) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["roleProfile", "role"], message: "대표 역할과 최소 프로필 역할이 같아야 합니다." });
  }
  if (value.ageBand === "UNDER_14" && value.role !== "PARENT") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["role"], message: "만 14세 미만은 보호자 역할로만 시작할 수 있습니다." });
  }
  for (const key of requiredProfileFields[value.role]) {
    if (!value.roleProfile.fields[key]?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["roleProfile", "fields", key], message: "필수 추천 기준을 입력해 주세요." });
    }
  }
});

export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;

export function roleProfileFields(payload: OnboardingPayload) {
  return { ...payload.roleProfile.fields, serviceZone: payload.zone };
}
