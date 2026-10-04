import { headers } from "next/headers";
import { LockKeyhole } from "lucide-react";

const ownerId = "8ab18a5e-4d89-4089-b8bb-833ee47c7714";

export async function checkAdminAccess(searchParams: Promise<{ preview?: string }> | undefined) {
  const requestHeaders = await headers();
  const params = searchParams ? await searchParams : {};
  const preview = params.preview === "1";
  if (!preview && requestHeaders.get("oai-authenticated-user-id") !== ownerId) {
    return {
      allowed: false as const,
      preview: false,
      restricted: (
        <main className="adm-restricted">
          <LockKeyhole size={32} />
          <h1>Access restricted</h1>
          <p>This dashboard is available to the site owner.</p>
          <a href="/login">Back to portal</a>
        </main>
      ),
    };
  }
  return { allowed: true as const, preview };
}
