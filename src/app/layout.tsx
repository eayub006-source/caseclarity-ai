import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "CaseClarity AI — Understand Every AI Decision. Trust Every Case.",
  description: "Explainable AI for legal-aid case workers. Evidence-backed recommendations, confidence indicators, and a full audit trail.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="bg-canvas text-fg antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
