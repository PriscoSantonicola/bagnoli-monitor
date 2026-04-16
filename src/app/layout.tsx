import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Bagnoli Monitor — Programma Bagnoli-Coroglio",
  description: "Cronoprogramma e avanzamento interventi del Programma Bagnoli-Coroglio",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        <footer className="max-w-7xl mx-auto px-4 py-6 text-xs text-slate-400 text-center">
          Dati aggiornati da schema <code>bagnoli</code> · vista pubblica
        </footer>
      </body>
    </html>
  );
}
