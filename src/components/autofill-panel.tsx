"use client";

import { useRef, useState } from "react";

export interface AutofillMeta {
  source: "hwp" | "image";
  simulated: boolean;
  textPreview: string | null;
}

/**
 * 파일(hwp/hwpx/이미지) 업로드 → /api/ai/autofill → 추출된 필드를 onFilled 로 전달.
 * 채워진 값은 폼(state)에만 반영되고 DB 저장은 관리자가 별도 버튼으로.
 */
export function AutofillPanel({
  kind,
  onFilled,
}: {
  kind: "school-request" | "instructor";
  onFilled: (fields: Record<string, unknown>, meta: AutofillMeta) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErr(null);
    setMsg(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/ai/autofill", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data?.error ?? "자동채움에 실패했습니다.");
        return;
      }
      onFilled(data.fields ?? {}, {
        source: data.source,
        simulated: !!data.simulated,
        textPreview: data.textPreview ?? null,
      });
      const src = data.source === "hwp" ? "한글 문서" : "이미지";
      setMsg(
        `${src}에서 값을 읽어 아래 폼에 채웠습니다${
          data.simulated ? " (모의 모드 — 키 미설정)" : ""
        }. 내용을 확인·수정한 뒤 저장하세요. 비어 있는 항목은 직접 입력하면 됩니다.`,
      );
    } catch {
      setErr("업로드 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-dashed border-brand/40 bg-blue-50/40 p-4">
      <h2 className="text-sm font-semibold">
        AI 자동채움 <span className="font-normal text-muted">(선택)</span>
      </h2>
      <p className="mt-1 text-xs text-muted">
        학교/강사에게 받은 <b>한글 문서(.hwp·.hwpx)</b> 또는{" "}
        <b>사진·스캔 이미지</b>를 올리면 아래 항목을 자동으로 채웁니다. 저장 전까지
        자유롭게 수정할 수 있고, 못 읽은 항목은 비워둡니다.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-blue-50 disabled:opacity-50"
        >
          {busy ? "읽는 중…" : "파일 선택"}
        </button>
        {fileName && <span className="text-xs text-muted">{fileName}</span>}
        <input
          ref={inputRef}
          type="file"
          accept=".hwp,.hwpx,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {msg && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </p>
      )}
    </section>
  );
}
