import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { consumeServerAiCredit, getLinkedTeacherStudent } from "@/lib/ai-usage-server";

export const runtime = "nodejs";

const JournalInput = z.object({
  mode: z.literal("journal"),
  studentId: z.string().min(1).max(80),
  studentAlias: z.string().min(1).max(24),
  gradeLevel: z.string().min(1).max(40),
  learningTopic: z.string().min(2).max(500),
  observation: z.string().min(5).max(3000),
  participationLevel: z.number().int().min(1).max(5),
  nextPlanHint: z.string().max(1000),
});

const SchoolRecordInput = z.object({
  mode: z.literal("school-record"),
  studentId: z.string().min(1).max(80),
  studentAlias: z.string().min(1).max(24),
  gradeLevel: z.string().min(1).max(40),
  section: z.enum(["SUBJECT_DETAIL", "AUTONOMY", "CLUB", "CAREER", "BEHAVIOR"]),
  evidence: z.string().min(10).max(5000),
  scoreContext: z.string().max(2000),
  growthContext: z.string().max(2000),
});

const RequestInput = z.discriminatedUnion("mode", [JournalInput, SchoolRecordInput]);

const JournalOutput = z.object({
  learningSummary: z.string(),
  participationSummary: z.string(),
  growthSummary: z.string(),
  nextPlan: z.string(),
});

const SchoolRecordOutput = z.object({
  draftText: z.string(),
  reviewPoints: z.array(z.string()).max(5),
});

function demoJournal(input: z.infer<typeof JournalInput>) {
  const participation =
    input.participationLevel >= 4
      ? "수업 활동에 주도적으로 참여하며 자신의 풀이와 생각을 또래와 나누었습니다."
      : input.participationLevel === 3
        ? "안내된 활동에 꾸준히 참여했고, 질문을 통해 이해하지 못한 부분을 확인했습니다."
        : "수업 참여에 시간이 필요했으나 구체적인 질문에는 자신의 생각을 표현했습니다.";

  return {
    learningSummary: `${input.learningTopic} 학습에서 관찰된 내용을 바탕으로 핵심 개념을 확인하고 적용하는 과정을 진행했습니다. ${input.observation}`,
    participationSummary: participation,
    growthSummary: "관찰된 행동을 근거로 학습 과정을 돌아보고, 다음 활동에서 보완할 지점을 스스로 확인했습니다.",
    nextPlan: input.nextPlanHint || "다음 수업에서는 이번 관찰 내용을 다시 확인하고, 학생이 스스로 설명하는 시간을 늘릴 계획입니다.",
  };
}

function demoSchoolRecord(input: z.infer<typeof SchoolRecordInput>) {
  return {
    draftText: `${input.evidence.trim()} 활동 과정에서 자신의 생각을 구체적으로 표현하고, 피드백을 반영해 결과를 보완하는 모습을 보임. 관찰된 사실을 바탕으로 학습 과정과 변화가 드러나도록 정리하였으며, 최종 기재 전 담당 교사의 확인이 필요함.`,
    reviewPoints: [
      "입력한 관찰 사실과 일치하는지 확인하세요.",
      "학생을 비교하거나 단정하는 표현이 없는지 확인하세요.",
      "2026학년도 학교생활기록부 기재요령의 해당 항목 기준을 확인하세요.",
    ],
  };
}

export async function POST(request: Request) {
  const parsed = RequestInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "입력 내용을 다시 확인해 주세요." }, { status: 400 });
  }

  let input = parsed.data;
  const linkedStudent = await getLinkedTeacherStudent(input.studentId);
  if (linkedStudent.mode === "server") {
    if (!linkedStudent.student) return Response.json({ error: linkedStudent.error ?? "담당 학생 연결을 확인해 주세요." }, { status: 403 });
    input = { ...input, studentAlias: linkedStudent.student.alias, gradeLevel: linkedStudent.student.gradeLevel };
  }
  const credit = await consumeServerAiCredit();
  if (!credit.allowed) {
    return Response.json({ error: credit.error, usageMode: credit.mode, remaining: credit.remaining }, { status: 402 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({
      data: input.mode === "journal" ? demoJournal(input) : demoSchoolRecord(input),
      generationMode: "demo-template",
      usageMode: credit.mode,
      remaining: credit.remaining,
      plan: credit.plan,
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_JOURNAL_MODEL || "gpt-5.6";

    if (input.mode === "journal") {
      const response = await openai.responses.parse({
        model,
        store: false,
        instructions:
          "당신은 대한민국 교육 현장의 교사 기록 보조 도구입니다. 제공된 관찰 사실만 사용하세요. 학생의 성격, 가정환경, 진단, 미래 성취를 추론하지 마세요. 실명 대신 제공된 별칭만 사용하세요. 존중하는 한국어로 간결하게 쓰고 교사가 수정할 초안으로 작성하세요.",
        input: JSON.stringify(input),
        text: { format: zodTextFormat(JournalOutput, "student_journal_draft") },
      });
      if (!response.output_parsed) throw new Error("empty structured response");
      return Response.json({ data: response.output_parsed, generationMode: "openai", usageMode: credit.mode, remaining: credit.remaining, plan: credit.plan });
    }

    const response = await openai.responses.parse({
      model,
      store: false,
      instructions:
        "당신은 2026학년도 대한민국 학교생활기록부 기재요령을 교사가 적용하도록 돕는 초안 도구입니다. 제공된 실제 관찰 근거만 사용하고 새로운 활동이나 성취를 만들지 마세요. 비교, 과장, 진단, 미래 예측을 쓰지 마세요. NEIS에 자동 입력되는 공식 기록이 아니며 담당 교사가 최종 검토할 초안입니다. 학생 별칭은 결과 문장에 꼭 필요할 때만 사용하세요.",
      input: JSON.stringify(input),
      text: { format: zodTextFormat(SchoolRecordOutput, "school_record_draft") },
    });
    if (!response.output_parsed) throw new Error("empty structured response");
    return Response.json({ data: response.output_parsed, generationMode: "openai", usageMode: credit.mode, remaining: credit.remaining, plan: credit.plan });
  } catch {
    return Response.json({
      data: input.mode === "journal" ? demoJournal(input) : demoSchoolRecord(input),
      generationMode: "demo-template",
      usageMode: credit.mode,
      remaining: credit.remaining,
      plan: credit.plan,
      notice: "AI 연결이 원활하지 않아 입력 내용을 바탕으로 기본 초안을 만들었어요.",
    });
  }
}
