export interface AccountDeletionRequest {
  status: "PENDING";
  requestedAt: string;
}

export type AccountDeletionRequestSource = "local-demo" | "server";

export interface AccountNotification {
  id: string;
  title: string;
  body: string;
  kind: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

const ACCOUNT_DELETION_REQUEST_KEY = "edutalk-account-deletion-request-v1";

export function getAccountDeletionRequest(): AccountDeletionRequest | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(ACCOUNT_DELETION_REQUEST_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<AccountDeletionRequest>;
    return parsed.status === "PENDING" && typeof parsed.requestedAt === "string"
      ? { status: "PENDING", requestedAt: parsed.requestedAt }
      : null;
  } catch {
    return null;
  }
}

/** 브라우저 체험용 접수 상태만 저장한다. 실제 계정 삭제나 운영자 전송은 하지 않는다. */
export function requestAccountDeletion(): AccountDeletionRequest {
  const request: AccountDeletionRequest = { status: "PENDING", requestedAt: new Date().toISOString() };
  window.localStorage.setItem(ACCOUNT_DELETION_REQUEST_KEY, JSON.stringify(request));
  return request;
}
