import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Login",
  description: "Sign in to your I Honore Tax & Wealth client portal.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
