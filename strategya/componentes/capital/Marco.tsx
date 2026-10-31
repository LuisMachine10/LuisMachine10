// Marco de las páginas de Mena Capital: título, mes, pestañas en segmentos, importar (secundario) y avisos.

import Link from "next/link";
import "@/estilos/capital.css";
import { Encabezado } from "@/componentes/Encabezado";
import { mesCorto, mesPrevio, mesSiguiente } from "@/lib/capital/fechas";
import { fechaHoraRD } from "@/lib/formato";
import { Icono } from "./Iconos";
import { SelectorMes } from "./SelectorMes";

export const PESTANAS = [
  { id: "resumen", ruta: "/capital", nombre: "Resumen" },
  { id: "cuentas", ruta: "/capital/cuentas", nombre: "Mis cuentas" },
  { id: "cartera", ruta: "/capital/cartera", nombre: "Cartera" },
  { id: "futuro", ruta: "/capital/futuro", nombre: "Proyecciones" },
  { id: "analisis", ruta: "/capital/analisis", nombre: "Riesgos" },
  { id: "cierre", ruta: "/capital/cierre", nombre: "Cierre" },
  { id: "ips", ruta: "/capital/ips", nombre: "Política" },
  { id: "ajustes", ruta: "/capital/ajustes", nombre: "Ajustes" },
] as const;
/** «importar» no es pestaña: es una acción secundaria en la cabecera. */
export type Pestana = (typeof PESTANAS)[number]["id"] | "importar";

/** Meses del selector: 14 hacia atrás, 12 hacia adelante y todos los que tengan cierre. */
export function opcionesDeMes(hoyMes: string, conCierre: string[], cerrados: Set<string>) {
  const set = new Set<string>([hoyMes, ...conCierre]);
  let k = hoyMes;
  for (let i = 0; i < 12; i++) set.add((k = mesSiguiente(k)));
  k = hoyMes;
  for (let i = 0; i < 14; i++) set.add((k = mesPrevio(k)));
  return [...set]
    .sort()
    .reverse()
    .map((v) => ({ valor: v, etiqueta: `${mesCorto(v)}${cerrados.has(v) ? " ✓" : ""}` }));
}

export function Marco({
  actual,
  mes,
  hoyMes,
  conCierre = [],
  cerrados = new Set<string>(),
  aviso,
  actualizado,
  children,
}: {
  actual: Pestana;
  mes: string;
  hoyMes: string;
  conCierre?: string[];
  cerrados?: Set<string>;
  aviso?: { ok?: string; error?: string };
  actualizado?: string | null;
  children: React.ReactNode;
}) {
  const q = `?mes=${mes}`;
  return (
    <>
      <Encabezado actual="capital" ultimaActualizacion={null} />
      <div className="cap-cabeza">
        <div className="cap-cabeza-fila">
          <div>
            <h1 className="cap-h1">Portafolio Financiero</h1>
          </div>
          <div className="cap-cabeza-acciones">
            {actual !== "importar" && actual !== "ips" && actual !== "cuentas" && actual !== "ajustes" ? <SelectorMes mes={mes} opciones={opcionesDeMes(hoyMes, conCierre, cerrados)} /> : null}
            <Link href={`/capital/importar${q}`} className="cap-enlace-chico" aria-current={actual === "importar" ? "page" : undefined}>
              <Icono nombre="subir" />
              Importar
            </Link>
          </div>
        </div>
        <nav className="cap-segmentos" aria-label="Secciones del Portafolio Financiero">
          {PESTANAS.map((p) => (
            <Link key={p.id} href={`${p.ruta}${q}`} aria-current={p.id === actual ? "page" : undefined}>
              {p.nombre}
            </Link>
          ))}
        </nav>
      </div>
      <main className="cap-principal" id="contenido">
        {aviso?.ok ? (
          <p className="cap-aviso ok cap-ancho" role="status">
            <Icono nombre="ok" />
            <span>{aviso.ok}</span>
          </p>
        ) : null}
        {aviso?.error ? (
          <p className="cap-aviso error cap-ancho" role="alert">
            <Icono nombre="error" />
            <span>{aviso.error}</span>
          </p>
        ) : null}
        {children}
      </main>
      <footer className="pie">
        <p>
          El Portafolio Financiero usa tus propios registros (importados o escritos aquí), el dólar del BCRD y los precios de Finnhub cuando existen. Las
          proyecciones son cálculos con tus supuestos, no pronósticos. No es asesoría de inversión. Gráficos:{" "}
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
            TradingView Lightweight Charts
          </a>
          .
          {actualizado ? ` Última edición de tus datos: ${fechaHoraRD(actualizado)} (hora RD).` : ""}
        </p>
        <p className="pie-legal">
          <a href="/terminos">Términos y privacidad</a>
        </p>
      </footer>
    </>
  );
}

/** Lee ?ok= y ?error= de la URL (los pone la server action al volver). */
export function avisoDe(sp: Record<string, string | string[] | undefined>): { ok?: string; error?: string } {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 400);
  return { ok: uno(sp.ok), error: uno(sp.error) };
}
