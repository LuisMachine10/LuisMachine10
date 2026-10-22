import type { Metadata, Viewport } from "next";
// Geist (texto, tablas y cifras con números tabulares) y Newsreader (títulos y cifras grandes). Ambas SIL OFL 1.1.
import "@fontsource-variable/geist";
import "@fontsource-variable/newsreader/opsz.css";
import "./globals.css";
import { COLOR_BARRA, SCRIPT_TEMA } from "@/componentes/tema/tema";

export const metadata: Metadata = {
  title: "Strategya",
  description: "Terminal personal de inteligencia financiera",
  robots: { index: false, follow: false },
  icons: { icon: "/icono.svg" },
};

export const viewport: Viewport = {
  themeColor: COLOR_BARRA.oscuro,
  width: "device-width",
  initialScale: 1,
};

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    // data-tema lo fija el script de abajo antes de pintar (claro, oscuro o según el sistema): sin parpadeo.
    <html lang="es-DO" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
