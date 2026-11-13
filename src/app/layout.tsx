import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.BRAND_NAME ?? "BCI Synergy POS",
  description: "Payments for the trades.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
