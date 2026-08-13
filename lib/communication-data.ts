export type CommunicationKind = "NOTICE" | "JOURNAL" | "MESSAGE";
export type CommunicationAuthor = "PARENT" | "TEACHER";

export interface CommunicationImageAttachment {
  id: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: string;
  signedUrl: string;
}

export interface CommunicationMessage {
  id: string;
  threadId?: string;
  studentId: string;
  author: CommunicationAuthor;
  kind: CommunicationKind;
  body: string;
  sentAt: string;
  createdAt?: string;
  isRead: boolean;
  isImportant: boolean;
  imageLabel?: string;
  imageDataUrl?: string;
  imageAttachment?: CommunicationImageAttachment;
  imageUploadStatus?: "UPLOADING" | "FAILED";
  imageUploadError?: string;
  journalNotice?: string;
}

export interface CommunicationThread {
  id?: string;
  studentId: string;
  teacherName: string;
  parentName: string;
  subjectLabel: string;
}

export const communicationThreads: CommunicationThread[] = [
  { studentId: "student-haeun", teacherName: "김수진 선생님", parentName: "하은 보호자", subjectLabel: "수학 A반" },
  { studentId: "student-minjun", teacherName: "김수진 선생님", parentName: "민준 보호자", subjectLabel: "통합과학 B반" },
  { studentId: "student-seoyun", teacherName: "김수진 선생님", parentName: "서윤 보호자", subjectLabel: "영어 내신반" },
];

export const initialCommunicationMessages: CommunicationMessage[] = [
  {
    id: "message-haeun-1",
    studentId: "student-haeun",
    author: "TEACHER",
    kind: "JOURNAL",
    body: "오늘은 이차함수의 꼭짓점과 그래프 이동을 함께 정리했어요. 하은이는 풀이 과정을 끝까지 설명하며 문제를 해결했어요.",
    sentAt: "오후 4:20",
    isRead: true,
    isImportant: true,
    journalNotice: "AI 학생일지 초안을 선생님이 확인한 뒤 공유한 예시입니다.",
  },
  {
    id: "message-haeun-2",
    studentId: "student-haeun",
    author: "PARENT",
    kind: "MESSAGE",
    body: "집에서도 오답 노트를 이어서 보겠습니다. 다음 과제는 언제까지 하면 될까요?",
    sentAt: "오후 5:06",
    isRead: false,
    isImportant: false,
  },
  {
    id: "message-minjun-1",
    studentId: "student-minjun",
    author: "TEACHER",
    kind: "NOTICE",
    body: "이번 주 통합과학 수업은 실험 보고서 준비물과 함께 진행합니다. 필기도구와 자를 챙겨 주세요.",
    sentAt: "어제",
    isRead: true,
    isImportant: true,
  },
  {
    id: "message-minjun-2",
    studentId: "student-minjun",
    author: "PARENT",
    kind: "MESSAGE",
    body: "준비물 확인했습니다. 감사합니다.",
    sentAt: "어제",
    isRead: true,
    isImportant: false,
  },
  {
    id: "message-seoyun-1",
    studentId: "student-seoyun",
    author: "TEACHER",
    kind: "JOURNAL",
    body: "독해 지문에서 근거 문장을 표시하는 연습을 했어요. 서윤이는 답을 고른 이유를 문장으로 설명하는 모습이 좋았습니다.",
    sentAt: "월요일",
    isRead: true,
    isImportant: false,
    journalNotice: "수업 관찰을 바탕으로 작성한 알림장 예시입니다.",
  },
];

export const communicationKindLabels: Record<CommunicationKind, string> = {
  NOTICE: "공지",
  JOURNAL: "알림장",
  MESSAGE: "메시지",
};

export const journalShareExample = "AI 학생일지에서 정리한 관찰 내용을 바탕으로 작성한 초안입니다. 공유 전 선생님이 사실과 표현을 확인해 주세요.";
