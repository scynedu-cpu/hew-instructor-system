"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { SurveyQuestion } from "@/lib/types";
import { QUESTION_TYPE_LABEL, SURVEY_GROUP_LABEL } from "@/lib/types";
import { confirmSurveyLink, getSuggestedSurveyQuestions, getSurveyLink } from "./actions";

type Mode = "loading" | "select" | "qr" | "error";

export function SurveyQrDialog({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("loading");
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await getSurveyLink(sessionId);
      if (cancelled) return;
      if (existing.error) {
        setErr(existing.error);
        setMode("error");
        return;
      }
      if (existing.url) {
        await renderQr(existing.url);
        return;
      }
      // 아직 확정된 링크가 없음 — 공통+그룹 문항을 전부 체크된 상태로 제안
      const suggested = await getSuggestedSurveyQuestions(sessionId);
      if (cancelled) return;
      if (suggested.error || !suggested.questions) {
        setErr(suggested.error ?? "문항을 불러오지 못했습니다.");
        setMode("error");
        return;
      }
      setQuestions(suggested.questions);
      setChecked(new Set(suggested.questions.map((q) => q.id)));
      setMode("select");
    })();

    async function renderQr(rawUrl: string) {
      // NEXT_PUBLIC_SITE_URL 미설정 시 상대경로만 오므로 현재 origin 을 붙인다.
      const full = rawUrl.startsWith("http")
        ? rawUrl
        : `${window.location.origin}${rawUrl}`;
      setUrl(full);
      try {
        const dataUrl = await QRCode.toDataURL(full, { width: 240, margin: 1 });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setMode("qr");
        }
      } catch {
        if (!cancelled) {
          setErr("QR코드 생성에 실패했습니다.");
          setMode("error");
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    setErr(null);
    setConfirming(true);
    try {
      const ids = questions.filter((q) => checked.has(q.id)).map((q) => q.id);
      const res = await confirmSurveyLink(sessionId, ids);
      if (res.error || !res.url) {
        setErr(res.error ?? "확정하지 못했습니다.");
        return;
      }
      const full = res.url.startsWith("http")
        ? res.url
        : `${window.location.origin}${res.url}`;
      setUrl(full);
      const dataUrl = await QRCode.toDataURL(full, { width: 240, margin: 1 });
      setQrDataUrl(dataUrl);
      setMode("qr");
    } finally {
      setConfirming(false);
    }
  }

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

  const common = questions.filter((q) => q.scope === "common");
  const grouped = questions.filter((q) => q.scope === "group");
  const groupCode = grouped[0]?.survey_group ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex w-full flex-col gap-3 rounded-lg bg-surface p-5 shadow-xl print:shadow-none ${
          mode === "select" ? "max-w-md" : "max-w-xs items-center text-center"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">교육만족도 설문 QR</h2>

        {(mode === "loading") && (
          <p className="py-8 text-sm text-muted">불러오는 중…</p>
        )}

        {mode === "error" && err && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}

        {mode === "select" && (
          <>
            <p className="text-left text-xs text-muted">
              이 세션의 프로그램 그룹
              {groupCode ? `(${SURVEY_GROUP_LABEL[groupCode]})` : ""}을 기준으로
              문항을 자동으로 모았습니다. 필요 없는 문항은 체크를 해제한 뒤
              확정하세요 — 확정 후에는 문항 구성을 다시 바꿀 수 없습니다.
            </p>

            <div className="flex max-h-96 w-full flex-col gap-4 overflow-y-auto text-left">
              <QuestionCheckList
                title="공통 문항"
                items={common}
                checked={checked}
                onToggle={toggle}
              />
              {groupCode && (
                <QuestionCheckList
                  title={`${SURVEY_GROUP_LABEL[groupCode]} 문항`}
                  items={grouped}
                  checked={checked}
                  onToggle={toggle}
                />
              )}
            </div>

            {err && (
              <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}

            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={confirming || checked.size === 0}
                onClick={confirm}
                className="flex-1 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
              >
                {confirming ? "확정 중…" : `확정하고 QR 생성 (${checked.size}문항)`}
              </button>
            </div>
          </>
        )}

        {mode === "qr" && (
          <>
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
          </>
        )}

        {mode !== "select" && (
          <button
            type="button"
            onClick={onClose}
            className="mt-1 text-sm text-muted hover:underline print:hidden"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionCheckList({
  title,
  items,
  checked,
  onToggle,
}: {
  title: string;
  items: SurveyQuestion[];
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      <ul className="flex flex-col gap-1">
        {items.map((q) => (
          <li key={q.id}>
            <label className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={checked.has(q.id)}
                onChange={() => onToggle(q.id)}
                className="mt-0.5"
              />
              <span className="flex-1">
                {q.question_text}
                <span className="ml-1 text-xs text-muted">
                  ({QUESTION_TYPE_LABEL[q.question_type]})
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
