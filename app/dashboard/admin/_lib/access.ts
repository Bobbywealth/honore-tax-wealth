import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/db";

/**
 * Page-level role gate for routes that should be admin-only — Bobby
 * asked that an agent on the /dashboard/admin/login only see:
 * Dashboard, Clients, Returns, Documents, Tasks, Calendar, Settings.
 *
 * Returns the user when allowed (so pages can scope their own queries
 * further if they want). Returns null when not allowed so callers
 * `return access.restricted` on the page.
 */
export type StaffCheck = { allowed: true; user: NonNullable<Awaited<ReturnType<typeof currentUser>>> } | { allowed: false };
export async function requireRoleAdmin() {
  const user = await currentUser();
  if (!user || user.role !== "admin") return { allowed: false as const };
  return { allowed: true as const, user };
}

/**
 * Staff helper: returns { role, isAdmin, user }. Pages can branch on
 * `isAdmin` to add an owner_id filter for non-admin staff without
 * pulling currentUser() in two places.
 */
export async function sessionStaff() {
  const user = await currentUser();
  if (!user) return null;
  return {
    user,
    isAdmin: user.role === "admin",
    isStaff: user.role === "staff" || user.role === "assistant" || user.role === "admin",
  };
}
