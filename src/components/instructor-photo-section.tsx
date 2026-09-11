"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { uploadPhoto } from "@/app/instructor/actions";

/**
 * 강사 사진 업로드 — 담당자 대리입력 전용(작업지시서 #008-3).
 * Storage 업로드·instructors.photo_url 갱신 로직은 강사 본인 화면(#003)의
 * uploadPhoto() 를 그대로 재사용한다. 이 액션은 이미 대리입력 쿠키
 * (PROXY_INSTRUCTOR_COOKIE) 로 instructorId 를 판별해 app_accounts(계정)
 * 유무와 무관하게 동작한다.
 */
export function InstructorPhotoSection({
  photoUrl,
  readOnly = false,
}: {
  photoUrl: string | null;
  readOnly?: boolean;
}) {
  const [preview, setPreview] = useState(photoUrl);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    const fd = new FormData();
    fd.set("file", file);
    setMsg(null);
    start(async () => {
      const r = await uploadPhoto(fd);
      if (r.error) {
        setMsg({ text: r.error });
      } else {
        setPreview(localUrl);
        setMsg({ ok: true, text: "사진이 변경되었습니다." });
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6">
      <div className="relative h-40 w-32 overflow-hidden rounded border border-border bg-zinc-100">
        {preview ? (
          <Image
            src={preview}
            alt="프로필 사진"
            fill
            sizes="128px"
            className="object-cover"
            unoptimized={preview.startsWith("blob:")}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted">
            사진 없음
          </span>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "업로드 중…" : "사진 변경"}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPhoto}
      />
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>
          {msg.text}
        </span>
      )}
    </section>
  );
}
