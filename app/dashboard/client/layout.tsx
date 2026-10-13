import { currentUser } from "@/lib/auth";
import ChatLauncher from "./_components/ChatLauncher";
import AppointmentRequestDialog from "./_components/AppointmentRequestDialog";

export const dynamic = "force-dynamic";

/**
 * Shared layout for the client portal. Mounts the floating chat widget
 * globally so clients can message their preparer from any dashboard page.
 * Also mounts the appointment request dialog, opened by any
 * `data-open-appointment-request` button in the portal.
 * Individual pages still own their auth redirects; when there is no session
 * (e.g. during a redirect) the widgets are simply not rendered.
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
        <>
          <ChatLauncher
            currentUserId={user.id}
            currentUserName={user.displayName ?? user.email}
          />
          <AppointmentRequestDialog />
        </>
      ) : null}
    </>
  );
}
