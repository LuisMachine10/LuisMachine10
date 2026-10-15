import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-condensed/latin-400.css";
import "@fontsource/ibm-plex-sans-condensed/latin-500.css";
import "@fontsource/ibm-plex-sans-condensed/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strategya",
  description: "Terminal personal de inteligencia financiera",
  robots: { index: false, follow: false },
  icons: { icon: "/icono.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0A0E13",
  width: "device-width",
  initialScale: 1,
};

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO">
      <body>{children}</body>
    </html>
  );
}
