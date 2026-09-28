import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coursewise — Canvas Study Planner",
  description: "Plan your week, track course grades, and study with your Canvas coursework in one place.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
