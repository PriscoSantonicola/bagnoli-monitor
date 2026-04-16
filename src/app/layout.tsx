import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rigenerazione Bagnoli-Coroglio — Trasparenza",
  description:
    "Monitoraggio pubblico del Programma di Rigenerazione Bagnoli-Coroglio. Avanzamento lavori, fondi pubblici e cantieri in tempo reale.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  other: {
    "color-scheme": "light",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
