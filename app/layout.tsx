import type { ReactNode } from "react";

export const metadata = {
  title: "Legible Novelty",
  description: "Stage 0 infrastructure substrate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
