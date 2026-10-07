import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

/** Messages now live in a floating popup (mounted in DashboardShell)
 *  — this route just sends the chat-deep-link back to the overview. */
export default function ClientMessagesRedirect() {
  redirect("/dashboard/client");
}
