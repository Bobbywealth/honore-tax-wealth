import { currentUser } from "@/lib/auth";
import ChatLauncher from "./_components/ChatLauncher";

export const dynamic = "force-dynamic";

/**
 * Shared layout for the client portal. Mounts the floating chat widget
 * globally so clients can message their preparer from any dashboard page.
 * Individual pages still own their auth redirects; when there is no session
 * (e.g. during a redirect) the widget is simply not rendered.
 */
export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  return (
    <>
      {children}
      {user ? (
        <ChatLauncher
          currentUserId={user.id}
          currentUserName={user.displayName ?? user.email}
        />
      ) : null}
    </>
  );
}
