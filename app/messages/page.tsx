"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BellRing,
  Camera,
  ChevronRight,
  FileText,
  ImagePlus,
  MessageCircle,
  Pin,
  Send,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  communicationKindLabels,
  communicationThreads,
  initialCommunicationMessages,
  journalShareExample,
  type CommunicationKind,
  type CommunicationImageAttachment,
  type CommunicationMessage,
  type CommunicationThread,
} from "@/lib/communication-data";
import { demoUsers, getAccessibleStudents } from "@/lib/student-data";
import type { Student } from "@/lib/types";
import styles from "./messages.module.css";

type DraftKind = CommunicationKind;
type ServerMessage = Omit<CommunicationMessage, "author"> & { author: "SELF" | "OTHER" };
interface ServerJournalDraft { id: string; student_id: string; content: { learningSummary?: string; participationSummary?: string; growthSummary?: string; nextPlan?: string }; created_at: string; }

const draftKinds: DraftKind[] = ["MESSAGE", "JOURNAL", "NOTICE"];
const communicationStorageKey = "edutalk-communications-v1";
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageBytes = 5 * 1024 * 1024;

function isStoredMessage(value: unknown): value is CommunicationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<CommunicationMessage>;
  return typeof message.id === "string"
    && typeof message.studentId === "string"
    && (message.author === "PARENT" || message.author === "TEACHER")
    && (message.kind === "NOTICE" || message.kind === "JOURNAL" || message.kind === "MESSAGE")
    && typeof message.body === "string"
    && typeof message.sentAt === "string"
    && typeof message.isRead === "boolean"
    && typeof message.isImportant === "boolean";
}

export default function MessagesPage() {
  const { role, setRole, customStudents, studentJournals } = useApp();
  const demoAccessibleStudents = useMemo(() => {
    const base = getAccessibleStudents(role);
    const custom = customStudents.filter((student) => {
      if (role === "TEACHER") return student.teacherUserIds.includes(demoUsers.TEACHER);
      if (role === "PARENT") return student.parentUserIds.includes(demoUsers.PARENT);
      return false;
    });
    const ids = new Set(base.map((student) => student.id));
    return [...base, ...custom.filter((student) => !ids.has(student.id))];
  }, [customStudents, role]);
  const accountConfigured = isSupabaseConfigured();
  const [serverReady, setServerReady] = useState(false);
  const [serverLoading, setServerLoading] = useState(accountConfigured);
  const [serverError, setServerError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const serverConnected = accountConfigured && serverReady;
  const [serverStudents, setServerStudents] = useState<Student[]>([]);
  const [serverThreads, setServerThreads] = useState<CommunicationThread[]>([]);
  const [serverJournals, setServerJournals] = useState<ServerJournalDraft[]>([]);
  const accessibleStudents = serverConnected ? serverStudents : demoAccessibleStudents;
  const accessibleStudentIds = useMemo(() => new Set(accessibleStudents.map((student) => student.id)), [accessibleStudents]);
  const allThreads = useMemo(() => {
    const byStudentId = new Map<string, CommunicationThread>(
      (serverConnected ? serverThreads : communicationThreads).map((thread) => [thread.studentId, thread]),
    );
    accessibleStudents.forEach((student) => {
      if (byStudentId.has(student.id)) return;
      byStudentId.set(student.id, {
        studentId: student.id,
        teacherName: "담당 선생님",
        parentName: student.alias + " 보호자",
        subjectLabel: student.className,
      });
    });
    return Array.from(byStudentId.values());
  }, [accessibleStudents, serverConnected, serverThreads]);
  const visibleThreads = useMemo(
    () => allThreads.filter((thread) => accessibleStudentIds.has(thread.studentId)),
    [accessibleStudentIds, allThreads],
  );
  const [selectedStudentId, setSelectedStudentId] = useState(visibleThreads[0]?.studentId ?? "");
  const [messages, setMessages] = useState<CommunicationMessage[]>(initialCommunicationMessages);
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<DraftKind>("MESSAGE");
  const [sharedJournalId, setSharedJournalId] = useState<string | null>(null);
  const [journalShareConfirmed, setJournalShareConfirmed] = useState(false);
  const [important, setImportant] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ name: string; dataUrl: string } | null>(null);
  const [serverImage, setServerImage] = useState<{ file: File; dataUrl: string } | null>(null);
  const attachmentRequestedIds = useRef(new Set<string>());
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const messageIdPrefix = useId();

  useEffect(() => {
    if (!accountConfigured) return;
    const client = createBrowserSupabaseClient();
    let active = true;
    const loadServerMessages = async () => {
      setServerLoading(true);
      setServerReady(false);
      setServerError("");
      setSharedJournalId(null);
      setJournalShareConfirmed(false);
      try {
        if (!client) throw new Error("계정 연결을 준비하지 못했어요. 다시 로그인해 주세요.");
        const { data, error } = await client.auth.getClaims();
        if (error || !data?.claims?.sub) throw new Error("로그인한 계정을 확인하지 못했어요. 다시 로그인해 주세요.");
        const response = await fetch("/api/messages");
        const payload = await response.json().catch(() => null) as { students?: Array<{ id: string; alias: string; gradeLevel: string; className: string }>; threads?: Array<CommunicationThread & { studentAlias?: string; gradeLevel?: string }>; messages?: ServerMessage[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "계정 대화를 불러오지 못했어요.");
        if (!active) return;
        const threads = payload?.threads ?? [];
        setServerStudents((payload?.students ?? []).map((student) => ({ id: student.id, alias: student.alias, gradeLevel: student.gradeLevel, className: student.className, institutionId: "", parentUserIds: [], teacherUserIds: [], isSynthetic: false })));
        setServerThreads(threads);
        setMessages((payload?.messages ?? []).map((message) => ({ ...message, author: message.author === "SELF" ? (role === "TEACHER" ? "TEACHER" : "PARENT") : (role === "TEACHER" ? "PARENT" : "TEACHER") })));
        setServerReady(true);
        if (role === "TEACHER") {
          const draftsResponse = await fetch("/api/ai/drafts");
          if (!draftsResponse.ok) {
            setNotice("계정 대화는 불러왔지만 저장된 AI 일지를 불러오지 못했어요.");
            return;
          }
          const draftsPayload = await draftsResponse.json() as { drafts?: Array<ServerJournalDraft & { kind?: string; teacher_confirmed?: boolean }> };
          if (active) setServerJournals((draftsPayload.drafts ?? []).flatMap((draft) => draft.kind === "JOURNAL" && draft.teacher_confirmed && typeof draft.id === "string" ? [{ ...draft, id: draft.id }] : []));
        }
      } catch (error) {
        if (!active) return;
        setServerStudents([]);
        setServerThreads([]);
        setServerJournals([]);
        setServerError(error instanceof Error ? error.message : "계정 대화를 불러오지 못했어요.");
      } finally {
        if (active) setServerLoading(false);
      }
    };
    void loadServerMessages();
    return () => { active = false; };
  }, [accountConfigured, reloadVersion, role]);

  useEffect(() => {
    if (!serverConnected || serverLoading || serverError) return;
    const missing = messages.filter((message) => message.threadId && !message.imageAttachment && !attachmentRequestedIds.current.has(message.id));
    if (missing.length === 0) return;
    missing.forEach((message) => attachmentRequestedIds.current.add(message.id));
    void Promise.all(missing.map(async (message) => {
      try {
        const response = await fetch(`/api/messages/attachments?messageId=${encodeURIComponent(message.id)}`);
        const payload = await response.json() as { attachment?: CommunicationImageAttachment | null };
        const attachment = payload.attachment;
        if (response.ok && attachment) {
          setMessages((current) => current.map((item) => item.id === message.id ? { ...item, imageAttachment: attachment } : item));
        }
      } catch {}
    }));
  }, [messages, serverConnected, serverError, serverLoading]);

  /* eslint-disable react-hooks/set-state-in-effect -- 서버 렌더 후 브라우저에서만 체험 대화를 복원한다. */
  useEffect(() => {
    if (accountConfigured) return;
    try {
      const stored = window.localStorage.getItem(communicationStorageKey);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every(isStoredMessage)) setMessages(parsed);
    } catch {
      setNotice("기기에 저장된 체험 대화를 불러오지 못했어요. 기본 체험 데이터로 계속할게요.");
    }
  }, [accountConfigured]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveMessages(nextMessages: CommunicationMessage[]) {
    setMessages(nextMessages);
    try {
      window.localStorage.setItem(communicationStorageKey, JSON.stringify(nextMessages));
      return true;
    } catch {
      setNotice("브라우저 저장 공간이 부족해 이 내용은 새로고침 후 유지되지 않아요. 사진 첨부를 줄여 다시 시도해 주세요.");
      return false;
    }
  }

  const activeStudentId = visibleThreads.some((thread) => thread.studentId === selectedStudentId)
    ? selectedStudentId
    : (visibleThreads[0]?.studentId ?? "");
  const selectedStudent = accessibleStudents.find((student) => student.id === activeStudentId);
  const selectedThread = visibleThreads.find((thread) => thread.studentId === activeStudentId);
  const serverThreadPending = serverConnected && !selectedThread?.id;
  const selectedMessages = messages.filter((message) => message.studentId === activeStudentId);
  const myAuthor = role === "TEACHER" ? "TEACHER" : "PARENT";
  const accountJournalsForStudent = useMemo(() => serverJournals
    .filter((journal) => journal.student_id === activeStudentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5), [activeStudentId, serverJournals]);
  const selectedSharedJournal = accountJournalsForStudent.find((journal) => journal.id === sharedJournalId) ?? null;

  async function chooseThread(studentId: string) {
    setSelectedStudentId(studentId);
    setSharedJournalId(null);
    setJournalShareConfirmed(false);
    const nextMessages = messages.map((message) => (
      message.studentId === studentId && message.author !== myAuthor ? { ...message, isRead: true } : message
    ));
    if (serverConnected) {
      setMessages(nextMessages);
      const unreadIds = messages.filter((message) => message.studentId === studentId && message.author !== myAuthor && !message.isRead).map((message) => message.id);
      if (unreadIds.length) await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-read", messageIds: unreadIds }) });
    } else saveMessages(nextMessages);
    setNotice("");
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (serverConnected && !allowedImageTypes.includes(file.type)) {
      setNotice("JPG, PNG, WebP 이미지만 첨부할 수 있어요.");
      return;
    }
    if (serverConnected && file.size > maxImageBytes) {
      setNotice("이미지는 5MB 이하만 첨부할 수 있어요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        if (serverConnected) {
          setServerImage({ file, dataUrl: reader.result });
          setNotice("이미지는 메시지 전송 뒤 계정 저장소에 첨부됩니다.");
        } else {
          setImagePreview({ name: file.name, dataUrl: reader.result });
          setNotice("사진은 이 브라우저에만 데이터 형태로 저장되는 체험용 미리보기입니다.");
        }
      }
    };
    reader.onerror = () => setNotice("사진 미리보기를 만들지 못했어요. 다른 사진으로 다시 선택해 주세요.");
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImagePreview(null);
    setServerImage(null);
  }

  function loadJournalExample() {
    setDraftKind("JOURNAL");
    if (serverConnected) {
      const savedJournal = serverJournals.find((journal) => journal.student_id === activeStudentId);
      if (!savedJournal) {
        setDraft("");
        setSharedJournalId(null);
        setJournalShareConfirmed(false);
        setNotice("현재 학생에게 저장된 일지가 없어요.");
        return;
      }
      const content = savedJournal.content;
      setDraft(`${content.learningSummary ?? ""}\n\n참여 모습: ${content.participationSummary ?? ""}\n성장 관찰: ${content.growthSummary ?? ""}\n다음 계획: ${content.nextPlan ?? ""}`.trim());
      setSharedJournalId(savedJournal.id);
      setJournalShareConfirmed(false);
      setNotice("현재 학생의 최신 저장 AI 학생일지를 불러왔어요. 공유 전 다시 확인해 주세요.");
      return;
    }
    const savedJournal = studentJournals.find((journal) => journal.studentId === activeStudentId);
    setDraft(
      savedJournal
        ? `${savedJournal.learningSummary}\n\n참여 모습: ${savedJournal.participationSummary}\n다음 계획: ${savedJournal.nextPlan}`
        : journalShareExample,
    );
    setSharedJournalId(null);
    setJournalShareConfirmed(false);
    setNotice(
      savedJournal
        ? "선생님이 확인해 저장한 AI 학생일지를 불러왔어요. 공유 전 다시 확인해 주세요."
        : "저장한 일지가 없어 체험 예시를 불러왔어요.",
    );
  }

  function selectAccountJournal(journal: ServerJournalDraft) {
    const content = journal.content;
    setDraftKind("JOURNAL");
    setSharedJournalId(journal.id);
    setJournalShareConfirmed(false);
    setDraft(`${content.learningSummary ?? ""}\n\n참여 모습: ${content.participationSummary ?? ""}\n성장 관찰: ${content.growthSummary ?? ""}\n다음 계획: ${content.nextPlan ?? ""}`.trim());
    setNotice("확정 학생일지를 선택했어요. 보호자 공유 확인 뒤 전송할 수 있어요.");
  }

  async function sendMessage() {
    if (!selectedStudent || (!draft.trim() && !imagePreview && !serverImage) || sending) return;
    if (serverConnected) {
      if (draftKind === "JOURNAL" && sharedJournalId && !journalShareConfirmed) {
        setNotice("보호자에게 공유하는 학생일지임을 확인해 주세요.");
        return;
      }
      if (!selectedThread?.id) {
        setNotice("보호자와 담당 선생님이 연결된 뒤 대화방이 만들어져요. 연결 코드 상태를 확인해 주세요.");
        return;
      }
      setSending(true);
      const response = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: selectedThread.id, body: draft.trim() || "사진을 첨부했어요.", kind: draftKind, isImportant: important, sharedAiDraftId: draftKind === "JOURNAL" ? sharedJournalId : null }) });
      const payload = await response.json() as { message?: CommunicationMessage; error?: string };
      if (!response.ok || !payload.message) { setNotice(payload.error ?? "메시지를 저장하지 못했어요."); setSending(false); return; }
      const createdMessage: CommunicationMessage = { ...payload.message, studentId: selectedStudent.id, author: myAuthor, imageUploadStatus: serverImage ? "UPLOADING" : undefined };
      setMessages((current) => [...current, createdMessage]);
      attachmentRequestedIds.current.add(createdMessage.id);
      setDraft("");
      setDraftKind("MESSAGE");
      setSharedJournalId(null);
      setJournalShareConfirmed(false);
      setImportant(false);
      const selectedImage = serverImage;
      setServerImage(null);
      if (!selectedImage) {
        setNotice("상용 계정 대화에 저장했어요.");
        setSending(false);
        return;
      }
      try {
        const body = new FormData();
        body.append("messageId", createdMessage.id);
        body.append("file", selectedImage.file, "message-image");
        const uploadResponse = await fetch("/api/messages/attachments", { method: "POST", body });
        const uploadPayload = await uploadResponse.json() as { attachment?: CommunicationImageAttachment; error?: string };
        if (!uploadResponse.ok || !uploadPayload.attachment) throw new Error(uploadPayload.error ?? "이미지를 첨부하지 못했어요.");
        const attachment = uploadPayload.attachment;
        setMessages((current) => current.map((message) => message.id === createdMessage.id ? { ...message, imageAttachment: attachment, imageUploadStatus: undefined } : message));
        setNotice("상용 계정 대화와 이미지를 저장했어요.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "이미지를 첨부하지 못했어요.";
        setMessages((current) => current.map((item) => item.id === createdMessage.id ? { ...item, imageUploadStatus: "FAILED", imageUploadError: message } : item));
        setNotice(`메시지는 저장됐지만 ${message}`);
      } finally {
        setSending(false);
      }
      return;
    }
    const nextMessage: CommunicationMessage = {
      id: `${messageIdPrefix}-message-${messages.length + 1}`,
      studentId: selectedStudent.id,
      author: myAuthor,
      kind: draftKind,
      body: draft.trim() || "사진을 첨부했어요.",
      sentAt: "방금",
      isRead: false,
      isImportant: important,
      imageLabel: imagePreview?.name,
      imageDataUrl: imagePreview?.dataUrl,
      journalNotice: draftKind === "JOURNAL" ? "AI 학생일지 내용을 참고한 체험 알림장입니다." : undefined,
    };
    const saved = saveMessages([...messages, nextMessage]);
    setDraft("");
    setDraftKind("MESSAGE");
    setSharedJournalId(null);
    setJournalShareConfirmed(false);
    setImportant(false);
    removeImage();
    if (saved) setNotice("체험 화면과 이 브라우저에만 저장했어요. 실제로 전송되지는 않습니다.");
  }

  if (accountConfigured && serverLoading) {
    return <div className="page-container"><section className={styles.accountState} aria-busy="true"><MessageCircle size={32} aria-hidden /><h1>계정 대화를 불러오는 중이에요</h1><p>연결된 학생과 메시지를 확인하고 있어요. 이 동안에는 새 메시지를 작성할 수 없습니다.</p></section></div>;
  }

  if (accountConfigured && serverError) {
    return <div className="page-container"><section className={styles.accountState} role="alert"><AlertCircle size={32} aria-hidden /><h1>계정 대화를 불러오지 못했어요</h1><p>{serverError}</p><div><button type="button" onClick={() => setReloadVersion((value) => value + 1)}>다시 시도</button><Link href="/login">다시 로그인</Link></div><small>계정 대화가 확인될 때까지 작성과 사진 첨부는 사용할 수 없습니다.</small></section></div>;
  }

  if (role === "STUDENT") {
    return (
      <div className="page-container">
        <section className={styles.emptyState}>
          <MessageCircle size={32} aria-hidden />
          <h1>학부모·선생님 전용 알림장이에요</h1>
          <p>학생 계정에서는 알림장 내용을 직접 작성하지 않아요.</p>
          <button type="button" onClick={() => setRole("PARENT")}>학부모 체험 모드로 보기</button>
        </section>
      </div>
    );
  }

  if (!selectedStudent || !selectedThread) {
    return (
      <div className="page-container">
        <section className={styles.emptyState}>
          <MessageCircle size={32} aria-hidden />
          <h1>열 수 있는 학생 대화가 없어요</h1>
          <p>{serverConnected ? "선생님이 만든 연결 코드로 학생을 연결하면 여기에서 대화를 확인할 수 있어요." : "체험 계정에 연결된 학생이 생기면 여기에서 대화를 확인할 수 있어요."}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>학생별 소통</span>
          <h1>알림장과 메시지를 한곳에서</h1>
          <p>학생별 수업 안내, 알림장, 1:1 대화를 차분하게 이어가세요.</p>
        </div>
        <div className={styles.demoTag}><AlertCircle size={16} aria-hidden /> {serverConnected ? "상용 계정 대화" : "체험 모드, 실제 전송 안 됨"}</div>
      </header>

      <section className={styles.communication} aria-label="학생별 알림장과 메시지">
        <aside className={styles.threadList} aria-label="접근 가능한 학생 대화">
          <div className={styles.listHeading}>
            <div>
              <span>대화 목록</span>
              <strong>{visibleThreads.length}명</strong>
            </div>
            <BellRing size={19} aria-hidden />
          </div>
          <div className={styles.threadItems}>
            {visibleThreads.map((thread) => {
              const student = accessibleStudents.find((item) => item.id === thread.studentId);
              const threadMessages = messages.filter((message) => message.studentId === thread.studentId);
              const latest = threadMessages.at(-1);
              const unread = threadMessages.filter((message) => message.author !== myAuthor && !message.isRead).length;
              const active = thread.studentId === activeStudentId;
              return (
                <button
                  key={thread.studentId}
                  type="button"
                  className={active ? styles.threadActive : styles.threadButton}
                  onClick={() => chooseThread(thread.studentId)}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={styles.studentAvatar} aria-hidden>{student?.alias.slice(0, 1)}</span>
                  <span className={styles.threadSummary}>
                    <strong>{student?.alias} <small>{student?.gradeLevel}</small></strong>
                    <span>{latest?.body ?? "새 대화를 시작해 보세요."}</span>
                  </span>
                  <span className={styles.threadMeta}>
                    <small>{latest?.sentAt ?? ""}</small>
                    {unread > 0 ? <b>{unread}</b> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={styles.chatPanel} aria-labelledby="chat-title">
          <header className={styles.chatHeader}>
            <span className={styles.studentAvatar} aria-hidden>{selectedStudent.alias.slice(0, 1)}</span>
            <div>
              <h2 id="chat-title">{selectedStudent.alias} <small>{selectedStudent.gradeLevel} · {selectedThread.subjectLabel}</small></h2>
              <p>{role === "TEACHER" ? `${selectedThread.parentName}님과` : `${selectedThread.teacherName}님과`} 1:1 대화</p>
            </div>
            <span className={styles.contextLabel}>학생 맥락</span>
          </header>

          {serverThreadPending ? <div className={styles.threadPending} role="status"><AlertCircle size={18} aria-hidden /><div><strong>아직 대화방이 만들어지지 않았어요</strong><span>{role === "TEACHER" ? "보호자가 연결 코드를 등록하면 이 학생의 1:1 대화방이 열려요." : "선생님이 발급한 보호자 연결 코드를 등록하면 1:1 대화방이 열려요."}</span></div><Link href="/student-records">{role === "TEACHER" ? "연결 코드 발급" : "연결 코드 등록"}</Link></div> : null}

          <div className={styles.aiGuide}>
            <Sparkles size={18} aria-hidden />
            <div>
              <strong>AI 학생일지와 연결</strong>
              <span>{role === "TEACHER" ? "선생님이 검토한 관찰 내용을 알림장으로 공유할 수 있어요." : "선생님이 확인한 학생일지가 알림장으로 공유됩니다."}</span>
            </div>
            {role === "TEACHER" && !serverConnected ? (
              <button type="button" onClick={loadJournalExample} disabled={serverThreadPending}>일지 불러오기 <ChevronRight size={15} /></button>
            ) : null}
          </div>

          {role === "TEACHER" && serverConnected ? <section className={styles.journalSharePanel} aria-labelledby="journal-share-title"><div><strong id="journal-share-title">확정 학생일지 공유</strong><span>선택한 학생의 최근 확정 일지 5개만 표시합니다. 일반 메시지와 구분되어 보호자에게 전달됩니다.</span></div>{accountJournalsForStudent.length === 0 ? <p>이 학생에게 공유할 확정 학생일지가 아직 없어요.</p> : <div className={styles.journalShareList}>{accountJournalsForStudent.map((journal) => <button type="button" key={journal.id} data-selected={sharedJournalId === journal.id} onClick={() => selectAccountJournal(journal)} disabled={serverThreadPending}><time dateTime={journal.created_at}>{new Date(journal.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</time><strong>{journal.content.learningSummary ?? "학습 요약 없음"}</strong><small>{journal.content.nextPlan ?? journal.content.growthSummary ?? "다음 계획 없음"}</small></button>)}</div>}{selectedSharedJournal ? <div className={styles.journalPreview}><strong>선택한 일지 미리보기</strong><p>{selectedSharedJournal.content.learningSummary ?? "학습 요약 없음"}</p><p>참여 모습: {selectedSharedJournal.content.participationSummary ?? "기록 없음"}</p><p>다음 계획: {selectedSharedJournal.content.nextPlan ?? "기록 없음"}</p><label><input type="checkbox" checked={journalShareConfirmed} onChange={(event) => setJournalShareConfirmed(event.target.checked)} disabled={serverThreadPending} />보호자에게 이 확정 학생일지를 공유하는 것을 확인했어요.</label></div> : null}</section> : null}

          <div className={styles.messages} aria-live="polite">
            {selectedMessages.map((message) => {
              const mine = message.author === myAuthor;
              return (
                <article key={message.id} className={mine ? styles.messageMine : styles.messageOther}>
                  {!mine ? <span className={styles.messageName}>{message.author === "TEACHER" ? selectedThread.teacherName : selectedThread.parentName}</span> : null}
                  <div className={styles.bubbleRow}>
                    <div className={styles.bubble}>
                      <span className={styles.kindBadge} data-kind={message.kind}>{communicationKindLabels[message.kind]}</span>
                      {message.isImportant ? <Pin className={styles.pin} size={14} aria-label="중요 메시지" /> : null}
                      <p>{message.body}</p>
                      {message.imageAttachment ? (
                        <a className={styles.imageAttachment} href={message.imageAttachment.signedUrl} target="_blank" rel="noreferrer">
                          <Image src={message.imageAttachment.signedUrl} alt="대화에 첨부한 이미지" width={160} height={120} unoptimized />
                          <span>첨부 이미지 보기</span>
                        </a>
                      ) : message.imageUploadStatus === "UPLOADING" ? <span className={styles.imageUploadState}>이미지를 첨부하는 중이에요.</span> : message.imageUploadStatus === "FAILED" ? <span className={styles.imageUploadFailed}>{message.imageUploadError ?? "이미지를 첨부하지 못했어요."}</span> : message.imageLabel ? (
                        <span className={styles.imageAttachment}>
                          {message.imageDataUrl ? <Image src={message.imageDataUrl} alt="대화에 첨부한 사진" width={44} height={44} unoptimized /> : <Camera size={15} aria-hidden />}
                          {message.imageLabel}
                        </span>
                      ) : null}
                      {message.journalNotice ? <span className={styles.journalNote}><FileText size={14} aria-hidden /> {message.journalNotice}</span> : null}
                    </div>
                    <span className={styles.messageTime}>{message.isRead && mine ? "읽음 " : ""}{message.sentAt}</span>
                  </div>
                </article>
              );
            })}
          </div>

          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <div className={styles.composerTools}>
              <div className={styles.kindSelector} aria-label="보낼 내용 유형">
                {draftKinds.map((kind) => (
                  <button key={kind} type="button" data-active={draftKind === kind} onClick={() => { setDraftKind(kind); if (kind !== "JOURNAL") { setSharedJournalId(null); setJournalShareConfirmed(false); } }} disabled={(accountConfigured && !serverReady) || serverThreadPending}>{communicationKindLabels[kind]}</button>
                ))}
              </div>
              <button className={important ? styles.importantActive : styles.importantButton} type="button" onClick={() => setImportant((value) => !value)} aria-pressed={important} disabled={(accountConfigured && !serverReady) || serverThreadPending}>
                <Star size={17} aria-hidden /> 중요
              </button>
            </div>
            {imagePreview || serverImage ? (
              <div className={styles.imagePreview}>
                <Image src={imagePreview?.dataUrl ?? serverImage!.dataUrl} alt="첨부할 사진 미리보기" width={42} height={42} unoptimized />
                <span>{imagePreview?.name ?? "첨부할 이미지"}</span>
                <button type="button" onClick={removeImage} aria-label="첨부 사진 제거" disabled={accountConfigured && !serverReady}><X size={16} /></button>
              </div>
            ) : null}
            <div className={styles.inputRow}>
              <label className={styles.imageButton}>
                <ImagePlus size={20} aria-hidden />
                <span className="sr-only">사진 첨부</span>
                <input type="file" accept={serverConnected ? "image/jpeg,image/png,image/webp" : "image/*"} onChange={chooseImage} disabled={(accountConfigured && !serverReady) || serverThreadPending} />
              </label>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={serverThreadPending ? "대화방 연결 후 메시지를 작성할 수 있어요." : draftKind === "JOURNAL" ? "오늘의 관찰과 안내를 적어 주세요." : "메시지를 입력해 주세요."} rows={2} maxLength={1000} disabled={(accountConfigured && !serverReady) || serverThreadPending} />
              <button className={styles.sendButton} type="submit" disabled={sending || (accountConfigured && !serverReady) || serverThreadPending || (serverConnected && draftKind === "JOURNAL" && Boolean(sharedJournalId) && !journalShareConfirmed) || (!draft.trim() && !imagePreview && !serverImage)} aria-label={serverConnected ? "메시지 전송" : "체험 메시지 추가"}><Send size={20} /></button>
            </div>
            {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
            <p className={styles.storageHint}>{serverConnected ? "메시지와 이미지 1장은 계정 대화에 저장됩니다. JPG, PNG, WebP 이미지는 5MB 이하만 첨부할 수 있어요." : "작성 내용과 사진은 이 기기의 브라우저 저장 공간에만 보관되는 체험 데이터입니다."}</p>
          </form>
        </section>
      </section>
    </div>
  );
}
