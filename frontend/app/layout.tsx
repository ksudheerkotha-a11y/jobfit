import "./globals.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

// One typeface everywhere, self-hosted at build time by next/font — avoids
// the old system-ui stack rendering as a different OS-default font per
// visitor (San Francisco / Segoe UI / Roboto), which wasn't actually "one
// geometric sans applied globally" despite looking like a single rule.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "jobfit — Executive Shortlist",
  description: "Fewer, better, real job matches.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
