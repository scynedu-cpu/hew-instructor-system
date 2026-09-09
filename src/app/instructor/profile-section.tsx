"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import type { Instructor } from "@/lib/types";
import { saveProfile, uploadPhoto } from "./actions";

function maskAccount(v: string): string {
  const digits = v.replace(/\s/g, "");
  if (digits.length <= 4) return v;
  return `${"•".repeat(Math.max(digits.length - 4, 3))}${digits.slice(-4)}`;
}

export function ProfileSection({ instructor }: { instructor: Instructor }) {
  const [form, setForm] = useState({
    name: instructor.name ?? "",
    mobile_phone: instructor.mobile_phone ?? "",
    birth_date: instructor.birth_date ?? "",
    address: instructor.address ?? "",
    home_phone: instructor.home_phone ?? "",
    email: instructor.email ?? "",
    bank_account: instructor.bank_account ?? "",
  });
  const [revealAccount, setRevealAccount] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const canSave = form.name.trim() !== "" && form.mobile_phone.trim() !== "";

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await saveProfile(form);
      setMsg(
        r.error
          ? { text: r.error }
          : { ok: true, text: "저장되었습니다." },
      );
    });
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setMsg(null);
    start(async () => {
      const r = await uploadPhoto(fd);
      setMsg(
        r.error ? { text: r.error } : { ok: true, text: "사진이 변경되었습니다." },
      );
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold">기본 프로필</h2>

      <div className="flex flex-col gap-4 sm:flex-row">
        {/* 사진 */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-28 w-24 overflow-hidden rounded border border-border bg-zinc-100">
            {instructor.photo_url ? (
              <Image
                src={instructor.photo_url}
                alt="프로필 사진"
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-muted">
                사진 없음
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="text-xs text-brand hover:underline disabled:opacity-60"
          >
            사진 변경
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onPhoto}
          />
        </div>

        {/* 필드 */}
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="성명" required>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="휴대전화" required>
            <input
              value={form.mobile_phone}
              onChange={(e) => set("mobile_phone", e.target.value)}
              placeholder="010-0000-0000"
              className="input"
            />
          </Field>
          <Field label="생년월일">
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => set("birth_date", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="자택전화">
            <input
              value={form.home_phone}
              onChange={(e) => set("home_phone", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="이메일">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="주소">
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="계좌(통장) 번호">
            {revealAccount ? (
              <div className="flex gap-2">
                <input
                  value={form.bank_account}
                  onChange={(e) => set("bank_account", e.target.value)}
                  placeholder="은행 / 계좌번호"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={() => setRevealAccount(false)}
                  className="text-xs text-muted hover:underline"
                >
                  가리기
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded border border-border px-2 py-1.5 text-sm">
                  {form.bank_account ? maskAccount(form.bank_account) : "미등록"}
                </span>
                <button
                  type="button"
                  onClick={() => setRevealAccount(true)}
                  className="text-xs text-brand hover:underline"
                >
                  수정
                </button>
              </div>
            )}
          </Field>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSave || pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "저장 중…" : "프로필 저장"}
        </button>
        {!canSave && (
          <span className="text-xs text-amber-700">
            성명·휴대전화는 필수입니다.
          </span>
        )}
        {msg && (
          <span
            className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}
          >
            {msg.text}
          </span>
        )}
      </div>

      <style>{`
        .input {
          border: 1px solid var(--border);
          border-radius: 0.375rem;
          padding: 0.375rem 0.625rem;
          font-size: 0.875rem;
          background: #fff;
          width: 100%;
        }
        .input:focus { outline: none; border-color: var(--brand); }
      `}</style>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      <span>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
