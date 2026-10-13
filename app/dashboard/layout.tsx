import type { ReactNode } from "react";

// dashboard.css is loaded here (not in the root layout) so public marketing
// pages don't download or parse it. Plain <link> without `precedence` keeps it
// in DOM order (before /visual-upgrades.css), preserving the original cascade.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/dashboard.css" />
      {children}
    </>
  );
}
