import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniPro Assistant — Vulcan 220 Expert",
  description:
    "Multimodal AI assistant for the Vulcan OmniPro 220 multiprocess welder. Built on the Claude Agent SDK.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
