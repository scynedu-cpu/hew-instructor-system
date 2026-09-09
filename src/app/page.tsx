import { redirect } from "next/navigation";
import { requireUser, roleHome } from "@/lib/auth";

export default async function Home() {
  const { account } = await requireUser();
  redirect(roleHome(account.role));
}
