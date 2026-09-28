import type { Metadata, Viewport } from "next";
import { Figtree, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "KL Last Train Finder",
  description:
    "Find the latest RapidKL departure across the Kelana Jaya, Ampang, Kajang, Putrajaya, and Monorail lines, with transfer buffers and a network map.",
  applicationName: "KL Last Train Finder",
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-ink font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
