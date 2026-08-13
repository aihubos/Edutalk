import { z } from "zod";

const requiredScoreKeys = {
  PARENT: ["communication", "care", "growth"],
  STUDENT: ["scheduleFit", "schoolCommute", "classAtmosphere", "homeworkLoad", "classSize", "teachingExplanation", "levelTestHelpfulness", "peerComposition", "studySpace", "examPreparation", "understanding", "pace", "motivation", "commuteConvenience"],
  TEACHER: ["leadership", "workload", "welfare", "culture", "educationPhilosophy", "growth"],
} as const;

export const institutionReviewInput = z.object({
  institutionTargetKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  relation: z.enum(["PARENT", "STUDENT", "TEACHER"]),
  scores: z.record(z.string().min(1).max(60), z.number().min(1).max(5)),
  strength: z.string().trim().min(10).max(3000),
  improvement: z.string().trim().min(10).max(3000),
  recommendTo: z.string().trim().min(5).max(1000),
}).superRefine((value, context) => {
  for (const key of requiredScoreKeys[value.relation]) {
    if (typeof value.scores[key] !== "number") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["scores", key], message: "필수 평가 항목을 입력해 주세요." });
    }
  }
});
