"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CareerRow, CertRow, Instructor, InstructorUnavailablePeriod } from "@/lib/types";
import { AutofillPanel } from "@/components/autofill-panel";
import { SpecialtyRecommendations } from "@/components/specialty-recommendations";
import {
  saveInstructorProfile,
  createInstructorProfileFull,
} from "@/app/staff/instructors/actions";

type CareerItem = { year_month: string; description: string; issuing_org: string };
type CertItem = { cert_name: string; issued_date: string; issuing_org: string };
type UnavailableItem = { start_date: string; end_date: string; reason: string };

const emptyCareer: CareerItem = { year_month: "", description: "", issuing_org: "" };
const emptyCert: CertItem = { cert_name: "", issued_date: "", issuing_org: "" };
const emptyUnavailable: UnavailableItem = { start_date: "", end_date: "", reason: "" };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * "YYYY-MM-DD" 완전한 날짜만 통과 — AI 자동채움이 "2007-03"처럼 연·월만
 * 읽어온 경우 등 <input type="date"> 에 반영해도 화면엔 빈칸으로 보이면서
 * 저장 시점에야 DB 오류로 터지는 걸 막기 위해, 애초에 그런 값은 채우지
 * 않고 담당자가 직접 입력하게 비워둔다.
 */
function isFullDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 강사 기본정보 + 경력/자격증/전문분야 대리입력 폼.
 * `instructor` 가 있으면 기존 강사 수정(작업지시서 #008), 없으면 신규 생성
 * (작업지시서 #008-2 "파일/사진으로 시작") — 저장 한 번으로 instructors row
 * 와 하위 정보가 함께 생성되고, 이어서 대리입력 편집 화면으로 이동한다.
 */
export function InstructorProfileForm({
  instructor,
  career,
  certs,
  specialties,
  unavailable,
}: {
  instructor: Instructor | null;
  career: CareerRow[];
  certs: CertRow[];
  specialties: string[];
  unavailable: InstructorUnavailablePeriod[];
}) {
  const router = useRouter();
  const isNew = !instructor;

  const [name, setName] = useState(instructor?.name ?? "");
  const [birthDate, setBirthDate] = useState(instructor?.birth_date ?? "");
  const [address, setAddress] = useState(instructor?.address ?? "");
  const [homePhone, setHomePhone] = useState(instructor?.home_phone ?? "");
  const [mobilePhone, setMobilePhone] = useState(instructor?.mobile_phone ?? "");
  const [email, setEmail] = useState(instructor?.email ?? "");

  const [careerRows, setCareerRows] = useState<CareerItem[]>(
    career.length
      ? career.map((c) => ({
          year_month: c.year_month ?? "",
          description: c.description ?? "",
          issuing_org: c.issuing_org ?? "",
        }))
      : [{ ...emptyCareer }],
  );
  const [certRows, setCertRows] = useState<CertItem[]>(
    certs.length
      ? certs.map((c) => ({
          cert_name: c.cert_name ?? "",
          issued_date: c.issued_date ?? "",
          issuing_org: c.issuing_org ?? "",
        }))
      : [{ ...emptyCert }],
  );
  const [specs, setSpecs] = useState<string[]>(specialties);
  const [specInput, setSpecInput] = useState("");
  const [unavailableRows, setUnavailableRows] = useState<UnavailableItem[]>(
    unavailable.length
      ? unavailable.map((u) => ({
          start_date: u.start_date,
          end_date: u.end_date,
          reason: u.reason ?? "",
        }))
      : [{ ...emptyUnavailable }],
  );

  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function applyAutofill(f: Record<string, unknown>) {
    if (str(f.name)) setName(str(f.name));
    if (isFullDate(str(f.birth_date))) setBirthDate(str(f.birth_date));
    if (str(f.address)) setAddress(str(f.address));
    if (str(f.home_phone)) setHomePhone(str(f.home_phone));
    if (str(f.mobile_phone)) setMobilePhone(str(f.mobile_phone));
    if (str(f.email)) setEmail(str(f.email));

    if (Array.isArray(f.career)) {
      const rows = (f.career as unknown[])
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          return {
            year_month: str(o.year_month),
            description: str(o.description),
            issuing_org: str(o.issuing_org),
          };
        })
        .filter((r) => r.description);
      if (rows.length) setCareerRows(rows);
    }
    if (Array.isArray(f.certifications)) {
      const rows = (f.certifications as unknown[])
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          const issuedDate = str(o.issued_date);
          return {
            cert_name: str(o.cert_name),
            issued_date: isFullDate(issuedDate) ? issuedDate : "",
            issuing_org: str(o.issuing_org),
          };
        })
        .filter((r) => r.cert_name);
      if (rows.length) setCertRows(rows);
    }
    if (Array.isArray(f.specialties)) {
      const list = (f.specialties as unknown[])
        .map((s) => String(s).trim())
        .filter(Boolean);
      if (list.length) setSpecs([...new Set(list)]);
    }
  }

  function save() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const payload = {
        name,
        birth_date: birthDate,
        address,
        home_phone: homePhone,
        mobile_phone: mobilePhone,
        email,
        career: careerRows,
        certs: certRows,
        specialties: specs,
        unavailable: unavailableRows,
      };
      if (instructor) {
        const res = await saveInstructorProfile(instructor.id, payload);
        if (res.error) setErr(res.error);
        else setMsg(res.ok ?? "저장했습니다.");
      } else {
        const res = await createInstructorProfileFull(payload);
        if (res.error) {
          setErr(res.error);
          return;
        }
        if (res.instructorId) {
          router.push(`/staff/instructors/${res.instructorId}/edit`);
        }
      }
    });
  }

  const inputCls =
    "rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-5">
      <AutofillPanel kind="instructor" onFilled={applyAutofill} />

      {/* 기본 정보 */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="font-semibold">기본 정보</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            성명 <span className="text-red-600">*</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            생년월일
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            주소
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            자택전화
            <input value={homePhone} onChange={(e) => setHomePhone(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            휴대전화
            <input value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            이메일
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </label>
        </div>
        <p className="text-xs text-muted">
          주민등록번호·계좌번호 등 민감정보는 여기 입력하지 않습니다(스캔 파일만 서류함에 보관).
        </p>
      </section>

      {/* 경력 */}
      <RowSection
        title="학력 / 경력"
        rows={careerRows}
        setRows={setCareerRows}
        empty={emptyCareer}
        render={(row, update) => (
          <>
            <input
              placeholder="연월 (예: 2020/03)"
              value={row.year_month}
              onChange={(e) => update({ year_month: e.target.value })}
              className={`${inputCls} w-32`}
            />
            <input
              placeholder="내용 *"
              value={row.description}
              onChange={(e) => update({ description: e.target.value })}
              className={`${inputCls} flex-1`}
            />
            <input
              placeholder="발령청/기타"
              value={row.issuing_org}
              onChange={(e) => update({ issuing_org: e.target.value })}
              className={`${inputCls} w-40`}
            />
          </>
        )}
      />

      {/* 자격증 */}
      <RowSection
        title="자격증"
        rows={certRows}
        setRows={setCertRows}
        empty={emptyCert}
        render={(row, update) => (
          <>
            <input
              placeholder="자격증명 *"
              value={row.cert_name}
              onChange={(e) => update({ cert_name: e.target.value })}
              className={`${inputCls} flex-1`}
            />
            <input
              type="date"
              value={row.issued_date}
              onChange={(e) => update({ issued_date: e.target.value })}
              className={`${inputCls} w-40`}
            />
            <input
              placeholder="발급기관"
              value={row.issuing_org}
              onChange={(e) => update({ issuing_org: e.target.value })}
              className={`${inputCls} w-40`}
            />
          </>
        )}
      />

      {/* 강의 불가기간 (작업지시서 #015) */}
      <RowSection
        title="강의 불가기간"
        rows={unavailableRows}
        setRows={setUnavailableRows}
        empty={emptyUnavailable}
        render={(row, update) => (
          <>
            <input
              type="date"
              value={row.start_date}
              onChange={(e) => update({ start_date: e.target.value })}
              className={`${inputCls} w-40`}
            />
            <span className="text-sm text-muted">~</span>
            <input
              type="date"
              value={row.end_date}
              onChange={(e) => update({ end_date: e.target.value })}
              className={`${inputCls} w-40`}
            />
            <input
              placeholder="사유 (선택)"
              value={row.reason}
              onChange={(e) => update({ reason: e.target.value })}
              className={`${inputCls} flex-1`}
            />
          </>
        )}
      />

      {/* 전문분야 */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <h2 className="font-semibold">전문분야</h2>
        <div className="flex flex-wrap gap-2">
          {specs.length === 0 && (
            <span className="text-xs text-muted">등록된 전문분야가 없습니다.</span>
          )}
          {specs.map((s) => (
            <span key={s} className="badge bg-blue-50 text-blue-700">
              {s}
              <button
                type="button"
                onClick={() => setSpecs((prev) => prev.filter((x) => x !== s))}
                className="ml-1 text-blue-400 hover:text-red-600"
                aria-label={`${s} 삭제`}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <SpecialtyRecommendations
          career={careerRows}
          certs={certRows}
          existing={specs}
          onAdd={(s) => {
            if (!specs.includes(s)) setSpecs((p) => [...p, s]);
          }}
        />

        <div className="flex gap-2">
          <input
            value={specInput}
            onChange={(e) => setSpecInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = specInput.trim();
                if (v && !specs.includes(v)) setSpecs((p) => [...p, v]);
                setSpecInput("");
              }
            }}
            placeholder="전문분야 입력 후 Enter"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              const v = specInput.trim();
              if (v && !specs.includes(v)) setSpecs((p) => [...p, v]);
              setSpecInput("");
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
          >
            추가
          </button>
        </div>
      </section>

      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      )}
      {msg && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {msg}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending || !name.trim()}
        className="self-start rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? (isNew ? "생성 중…" : "저장 중…") : isNew ? "생성하고 대리입력 계속" : "저장"}
      </button>
    </div>
  );
}

function RowSection<T extends Record<string, string>>({
  title,
  rows,
  setRows,
  empty,
  render,
}: {
  title: string;
  rows: T[];
  setRows: React.Dispatch<React.SetStateAction<T[]>>;
  empty: T;
  render: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {render(row, (patch) =>
            setRows((prev) =>
              prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
            ),
          )}
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              className="text-sm text-muted hover:text-red-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { ...empty }])}
        className="self-start text-sm font-medium text-brand hover:underline"
      >
        + 행 추가
      </button>
    </section>
  );
}
