"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  PREVIEW_SCHOOL_COOKIE,
  PREVIEW_INSTRUCTOR_COOKIE,
} from "@/lib/auth";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8,
};

export async function pickSchool(formData: FormData) {
  await requireRole("staff");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const jar = await cookies();
  jar.set(PREVIEW_SCHOOL_COOKIE, id, COOKIE_OPTS);
  redirect("/school");
}

export async function pickInstructor(formData: FormData) {
  await requireRole("staff");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const jar = await cookies();
  jar.set(PREVIEW_INSTRUCTOR_COOKIE, id, COOKIE_OPTS);
  redirect("/instructor");
}
