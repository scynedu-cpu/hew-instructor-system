"use client";

import { useRef, useState, useTransition } from "react";
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_STYLE,
  DOC_TYPES,
  computeStatus,
  hasExpiry,
  type DocType,
} from "@/lib/documents";
import { uploadDocument, deleteDocument } from "./actions";

export interface DocView {
  id: string;
  doc_type: string;
  issued_at: string | null;
  expires_at: string | null;
  signedUrl: string | null;
  fileName: string | null;
}

export function DocumentsClient({
  docs,
  readOnly = false,
}: {
  docs: DocView[];
  readOnly?: boolean;
}) {
  const byType = new Map(docs.map((d) => [d.doc_type, d]));

  return (
    <div className="flex flex-col gap-3">
      {DOC_TYPES.map((t) => (
        <DocRow
          key={t}
          docType={t}
          current={byType.get(t) ?? null}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function DocRow({
  docType,
  current,
  readOnly,
}: {
  docType: DocType;
  current: DocView | null;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [issuedAt, setIssuedAt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const status = current ? computeStatus(current.expires_at) : null;
  const needsReupload = status === "expiring_soon" || status === "expired";

  function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg("파일을 선택하세요.");
      return;
    }
    const fd = new FormData();
    fd.set("doc_type", docType);
    fd.set("issued_at", issuedAt);
    fd.set("file", file);
    setMsg(null);
    start(async () => {
      const r = await uploadDocument(fd);
      if (r.error) setMsg(r.error);
      else {
        setOpen(false);
        setIssuedAt("");
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function remove() {
    if (!current) return;
    setMsg(null);
    start(async () => {
      const r = await deleteDocument(current.id);
      if (r.error) setMsg(r.error);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{docType}</span>
        {hasExpiry(docType) && (
          <span className="text-xs text-muted">
            (유효기간 {docType === "이력서" ? "3년" : "1년"})
          </span>
        )}

        {current ? (
          <>
            {status && (
              <span className={`badge ${DOC_STATUS_STYLE[status]}`}>
                {DOC_STATUS_LABEL[status]}
              </span>
            )}
            {current.signedUrl && (
              <a
                href={current.signedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-link hover:underline"
              >
                파일 보기
              </a>
            )}
            <span className="text-xs text-muted">
              {current.issued_at && `발급 ${current.issued_at}`}
              {current.expires_at && ` · 만료 ${current.expires_at}`}
            </span>
          </>
        ) : (
          <span className="badge bg-zinc-100 text-zinc-500">미제출</span>
        )}

        {!readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                needsReupload
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-border hover:bg-zinc-50"
              }`}
            >
              {current ? "재업로드" : "업로드"}
            </button>
            {current && (
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="text-xs text-muted hover:text-red-600"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>

      {!readOnly && open && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            발급일{hasExpiry(docType) && <span className="text-red-600"> *</span>}
            <input
              type="date"
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
              className="rounded border border-border px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            파일
            <input
              ref={fileRef}
              type="file"
              className="text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={pending || (hasExpiry(docType) && !issuedAt)}
            onClick={submit}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? "업로드 중…" : "저장"}
          </button>
          {hasExpiry(docType) && !issuedAt && (
            <span className="text-xs text-amber-700">
              이 서류는 발급일을 입력해야 만료일이 계산됩니다.
            </span>
          )}
        </div>
      )}

      {msg && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {msg}
        </p>
      )}
    </div>
  );
}
