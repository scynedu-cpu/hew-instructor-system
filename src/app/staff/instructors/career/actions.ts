"use server";

// 작업지시서 #019 (2-2, 2-3) — 강사별 강의이력 조회 + 경력증명서 발급.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { programLabel } from "@/lib/types";
import type { CareerCertificateIssuance, LectureHistoryRow, OrgSettings } from "@/lib/types";
import { buildCareerCertificatePdf } from "@/lib/career-certificate-pdf";

const PATH = "/staff/instructors/career";
const CERT_BUCKET = "career-certificates";

export interface LectureHistoryResult {
  rows: LectureHistoryRow[];
  totalCount: number;
  totalHours: number;
  error?: string;
}

export async function getLectureHistory(
  instructorId: string,
  from?: string | null,
  to?: string | null,
): Promise<LectureHistoryResult> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: assignments, error: aErr } = await supabase
    .from("assignments")
    .select("id, session_id")
    .eq("instructor_id", instructorId)
    .returns<{ id: string; session_id: string }[]>();
  if (aErr) return { rows: [], totalCount: 0, totalHours: 0, error: aErr.message };

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const sessionByAssignment = new Map((assignments ?? []).map((a) => [a.id, a.session_id]));
  if (assignmentIds.length === 0) return { rows: [], totalCount: 0, totalHours: 0 };

  let q = supabase
    .from("lecture_confirmations")
    .select("id, assignment_id, actual_date, actual_hours")
    .in("assignment_id", assignmentIds)
    .order("actual_date", { ascending: true });
  if (from) q = q.gte("actual_date", from);
  if (to) q = q.lte("actual_date", to);
  const { data: confirmations, error: cErr } = await q.returns<
    { id: string; assignment_id: string; actual_date: string | null; actual_hours: number | null }[]
  >();
  if (cErr) return { rows: [], totalCount: 0, totalHours: 0, error: cErr.message };

  const sessionIds = [
    ...new Set((confirmations ?? []).map((c) => sessionByAssignment.get(c.assignment_id)).filter((v): v is string => Boolean(v))),
  ];
  const { data: sessions } = sessionIds.length
    ? await supabase
        .from("class_sessions")
        .select("id, school:schools(name), program:programs(name,category,sub_program)")
        .in("id", sessionIds)
        .returns<
          {
            id: string;
            school: { name: string } | null;
            program: { name: string; category: string | null; sub_program: string | null } | null;
          }[]
        >()
    : { data: [] as { id: string; school: { name: string } | null; program: { name: string; category: string | null; sub_program: string | null } | null }[] };
  const sessionMap = new Map((sessions ?? []).map((s) => [s.id, s]));

  const rows: LectureHistoryRow[] = (confirmations ?? []).map((c) => {
    const sessionId = sessionByAssignment.get(c.assignment_id);
    const session = sessionId ? sessionMap.get(sessionId) : undefined;
    return {
      id: c.id,
      actualDate: c.actual_date,
      actualHours: c.actual_hours,
      schoolName: session?.school?.name ?? "-",
      programLabel: session?.program ? programLabel(session.program) : "-",
    };
  });

  const totalCount = rows.length;
  const totalHours = Math.round(rows.reduce((s, r) => s + (r.actualHours ?? 0), 0) * 10) / 10;

  return { rows, totalCount, totalHours };
}

export async function getIssuances(
  instructorId: string,
): Promise<{ issuances: (CareerCertificateIssuance & { downloadUrl: string | null })[]; error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("career_certificate_issuances")
    .select("*")
    .eq("instructor_id", instructorId)
    .order("issued_at", { ascending: false })
    .returns<CareerCertificateIssuance[]>();
  if (error) return { issuances: [], error: error.message };

  const issuances = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from(CERT_BUCKET)
        .createSignedUrl(row.file_path, 60 * 60);
      return { ...row, downloadUrl: signed?.signedUrl ?? null };
    }),
  );

  return { issuances };
}

export async function issueCertificate(
  instructorId: string,
  from?: string | null,
  to?: string | null,
): Promise<{ ok?: boolean; documentNo?: string; error?: string }> {
  const { account } = await requireRole("staff");
  const supabase = await createClient();

  const history = await getLectureHistory(instructorId, from, to);
  if (history.error) return { error: history.error };
  if (history.rows.length === 0) return { error: "발급할 이력이 없습니다." };

  const { data: instructor, error: iErr } = await supabase
    .from("instructors")
    .select("name, birth_date")
    .eq("id", instructorId)
    .maybeSingle<{ name: string; birth_date: string | null }>();
  if (iErr) return { error: iErr.message };
  if (!instructor) return { error: "강사를 찾을 수 없습니다." };

  const { data: org } = await supabase
    .from("org_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle<OrgSettings>();

  let sealImageBuffer: Buffer | null = null;
  if (org?.seal_image_path) {
    const { data: blob } = await supabase.storage.from("org-assets").download(org.seal_image_path);
    if (blob) sealImageBuffer = Buffer.from(await blob.arrayBuffer());
  }

  const { data: documentNo, error: noErr } = await supabase.rpc("next_career_certificate_no");
  if (noErr || !documentNo) return { error: noErr?.message ?? "문서번호 채번에 실패했습니다." };

  const pdf = await buildCareerCertificatePdf({
    documentNo,
    instructorName: instructor.name,
    instructorBirthDate: instructor.birth_date,
    periodFrom: from ?? null,
    periodTo: to ?? null,
    rows: history.rows,
    totalCount: history.totalCount,
    totalHours: history.totalHours,
    org: {
      orgName: org?.org_name || "양재모 교육지원센터",
      ceoName: org?.ceo_name ?? "",
      address: org?.address ?? "",
    },
    sealImageBuffer,
    issuedAtLabel: `발급일자  ${new Date().toLocaleDateString("ko-KR")}`,
  });

  const filePath = `${instructorId}/${documentNo}.pdf`;
  const { error: upErr } = await supabase.storage
    .from(CERT_BUCKET)
    .upload(filePath, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) return { error: `업로드 실패: ${upErr.message}` };

  const { error: insErr } = await supabase.from("career_certificate_issuances").insert({
    instructor_id: instructorId,
    document_no: documentNo,
    period_from: from ?? null,
    period_to: to ?? null,
    total_count: history.totalCount,
    total_hours: history.totalHours,
    file_path: filePath,
    issued_by: account.display_name ?? "담당자",
  });
  if (insErr) {
    await supabase.storage.from(CERT_BUCKET).remove([filePath]);
    return { error: insErr.message };
  }

  revalidatePath(PATH);
  return { ok: true, documentNo };
}
