"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { saveRequestWithItems } from "@/app/school/actions";
import { parseRequestItems } from "@/lib/session-request";

export interface ProxyRequestState {
  error?: string;
}

export async function submitProxyRequest(
  _prev: ProxyRequestState,
  formData: FormData,
): Promise<ProxyRequestState> {
  const { account } = await requireRole("staff");

  const schoolId = String(formData.get("school_id") ?? "").trim();
  const teacherName = String(formData.get("teacher_name") ?? "").trim();
  const proxyNote = String(formData.get("proxy_note") ?? "").trim();
  const items = parseRequestItems(String(formData.get("items_json") ?? "[]"));

  if (!schoolId) return { error: "학교를 선택하세요." };

  const res = await saveRequestWithItems({
    schoolId,
    submittedBy: account.display_name ?? "담당자",
    teacherName,
    proxyNote,
    items,
  });
  if (res.error) return { error: res.error };

  revalidatePath("/staff/requests");
  redirect(`/staff/requests?proxy=1${res.autoApproved ? "&approved=1" : ""}`);
}
