import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

/**
 * /dashboard parent route. Sends signed-in staff to /dashboard/admin and
 * clients to /dashboard/client; otherwise back to /login.
 */
export default async function DashboardIndex() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard");
  if (user.role === "client") redirect("/dashboard/client");
  redirect("/dashboard/admin");
}
