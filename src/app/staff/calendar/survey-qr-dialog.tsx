"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getOrCreateSurveyLink } from "./actions";

export function SurveyQrDialog({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getOrCreateSurveyLink(sessionId);
      if (cancelled) return;
      if (res.error || !res.url) {
        setErr(res.error ?? "설문 링크를 생성하지 못했습니다.");
        return;
      }
      // NEXT_PUBLIC_SITE_URL 미설정 시 상대경로만 오므로 현재 origin 을 붙인다.
      const full = res.url.startsWith("http")
        ? res.url
        : `${window.location.origin}${res.url}`;
      setUrl(full);
      try {
        const dataUrl = await QRCode.toDataURL(full, { width: 240, margin: 1 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setErr("QR코드 생성에 실패했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없는 환경 — 무시(링크는 화면에 텍스트로도 보임)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-xs flex-col items-center gap-3 rounded-lg bg-surface p-5 text-center shadow-xl print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">교육만족도 설문 QR</h2>

        {err && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}

        {!err && !qrDataUrl && (
          <p className="py-8 text-sm text-muted">생성 중…</p>
        )}

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="설문 응답 QR코드"
            width={240}
            height={240}
            className="rounded-md border border-border"
          />
        )}

        {url && (
          <p className="w-full break-all rounded-md bg-zinc-50 px-2 py-1.5 text-xs text-muted">
            {url}
          </p>
        )}

        <div className="flex w-full gap-2 print:hidden">
          <button
            type="button"
            disabled={!url}
            onClick={copyLink}
            className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            {copied ? "복사됨" : "링크 복사"}
          </button>
          <button
            type="button"
            disabled={!qrDataUrl}
            onClick={() => window.print()}
            className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            인쇄
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-1 text-sm text-muted hover:underline print:hidden"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
