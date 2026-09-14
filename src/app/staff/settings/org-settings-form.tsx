"use client";

// 작업지시서 #019 (2-1) — 기관 설정 화면. 경력증명서 발급 시 공통으로 쓰는
// 기관명·대표자명·주소·직인 이미지를 한 번만 등록해두는 화면.

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { saveOrgSettings, uploadSealImage } from "./actions";

export function OrgSettingsForm({
  orgName,
  ceoName,
  address,
  sealImageUrl,
  updatedAtLabel,
}: {
  orgName: string;
  ceoName: string;
  address: string;
  sealImageUrl: string | null;
  updatedAtLabel: string | null;
}) {
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [sealPreview, setSealPreview] = useState(sealImageUrl);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onSubmit(formData: FormData) {
    setMsg(null);
    start(async () => {
      const res = await saveOrgSettings(formData);
      setMsg(res.error ? { text: res.error } : { ok: true, text: "저장했습니다." });
    });
  }

  function onSeal(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    const fd = new FormData();
    fd.set("file", file);
    setMsg(null);
    start(async () => {
      const res = await uploadSealImage(fd);
      if (res.error) {
        setMsg({ text: res.error });
      } else {
        setSealPreview(localUrl);
        setMsg({ ok: true, text: "직인 이미지를 등록했습니다." });
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={onSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          기관명 *
          <input
            name="org_name"
            defaultValue={orgName}
            required
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          대표자명
          <input
            name="ceo_name"
            defaultValue={ceoName}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          주소
          <input
            name="address"
            defaultValue={address}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </form>

      <section className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">기관 직인(도장)</h2>
        <p className="text-xs text-muted">경력증명서 하단에 삽입됩니다. 배경이 투명한 PNG 권장.</p>
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded border border-border bg-zinc-50">
          {sealPreview ? (
            <Image
              src={sealPreview}
              alt="기관 직인"
              width={96}
              height={96}
              className="object-contain"
              unoptimized
            />
          ) : (
            <span className="text-center text-[11px] text-muted">등록된 직인 없음</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
        >
          {sealPreview ? "직인 이미지 변경" : "직인 이미지 업로드"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onSeal} />
      </section>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>
      )}
      {updatedAtLabel && (
        <p className="text-xs text-muted">마지막 수정: {updatedAtLabel}</p>
      )}
    </div>
  );
}
