import { z } from "zod";

const list = z.array(z.string().trim().min(1).max(60)).min(1).max(12);

export const tutorProfileInput = z.object({
  displayName: z.string().trim().min(1).max(40),
  subjects: list,
  targetGrades: list,
  zones: list,
  introduction: z.string().trim().max(1000),
  pricePerHour: z.number().int().min(0),
  credentials: z.array(z.object({ type: z.enum(["IDENTITY", "TEACHING_CERT", "LANGUAGE_SCORE", "DEGREE"]), label: z.string().trim().min(1).max(80) })).max(4),
});

export const tutorJobInput = z.object({
  title: z.string().trim().min(1).max(120),
  studentGrade: z.string().trim().min(1).max(60),
  subject: z.string().trim().min(1).max(60),
  zone: z.string().trim().min(1).max(80),
  schedule: z.string().trim().min(1).max(160),
  budgetPerHour: z.number().int().min(0),
  detail: z.string().trim().min(1).max(3000),
});

export const tutorReviewInput = z.object({
  tutorId: z.string().uuid(),
  rating: z.number().min(1).max(5).refine((value) => Number.isInteger(value * 2), "평점은 0.5점 단위로 입력해 주세요."),
  content: z.string().trim().min(10).max(3000),
  lessonCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});

export const tutorContactInput = z.object({ tutorId: z.string().uuid(), message: z.string().trim().min(10).max(1000) });
export const tutorJobApplicationInput = z.object({ tutorJobId: z.string().uuid(), message: z.string().trim().min(10).max(1000) });
export const tutorRequestResponseInput = z.object({
  requestType: z.enum(["CONTACT", "APPLICATION"]),
  id: z.string().uuid(),
  status: z.enum(["IN_PROGRESS", "ANSWERED", "CLOSED"]),
  responseMessage: z.string().trim().min(1).max(1000),
});
