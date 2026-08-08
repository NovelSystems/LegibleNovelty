import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

// Atkinson Hyperlegible — ALL interface text. Self-hosted (no third-party font
// CDN, consistent with the platform's data-minimization stance). Exposed as the
// CSS variable the Tailwind theme maps to `--font-sans`.
const atkinson = localFont({
  variable: "--font-atkinson",
  display: "swap",
  src: [
    { path: "./fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/atkinson-hyperlegible-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/atkinson-hyperlegible-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
});

// Lora — module CONTENT only (applied via `.module-content` / `font-module`,
// never app-wide). Variable font: one file covers the 400–700 weight range.
const lora = localFont({
  variable: "--font-lora",
  display: "swap",
  src: [
    { path: "./fonts/lora-latin-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/lora-latin-wght-italic.woff2", weight: "400 700", style: "italic" },
  ],
});

export const metadata = {
  title: "Legible Novelty",
  description: "Stage 0 infrastructure substrate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
