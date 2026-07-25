import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "jobfit — Executive Shortlist",
  description: "Fewer, better, real job matches.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
