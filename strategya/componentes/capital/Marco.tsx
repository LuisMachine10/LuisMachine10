// Marco de las páginas de Mena Capital: encabezado con el mes, pestañas y aviso del último guardado.

import Link from "next/link";
import "@/estilos/capital.css";
import { Encabezado } from "@/componentes/Encabezado";
import { mesCorto, mesPrevio, mesSiguiente } from "@/lib/capital/fechas";
import { fechaHoraRD } from "@/lib/formato";
import { SelectorMes } from "./SelectorMes";

export const PESTANAS = [
  { id: "resumen", ruta: "/capital", nombre: "Resumen" },
  { id: "cierre", ruta: "/capital/cierre", nombre: "Cierre" },
  { id: "cartera", ruta: "/capital/cartera", nombre: "Cartera" },
  { id: "analisis", ruta: "/capital/analisis", nombre: "Análisis" },
  { id: "futuro", ruta: "/capital/futuro", nombre: "Futuro" },
  { id: "ips", ruta: "/capital/ips", nombre: "Política (IPS)" },
  { id: "importar", ruta: "/capital/importar", nombre: "Importar" },
] as const;
export type Pestana = (typeof PESTANAS)[number]["id"];

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
      <div className="cap-encabezado">
        <span className="cap-titulo">Mena Capital</span>
        {actual !== "importar" && actual !== "ips" ? <SelectorMes mes={mes} opciones={opcionesDeMes(hoyMes, conCierre, cerrados)} /> : null}
      </div>
      <nav className="cap-pestanas" aria-label="Secciones de Mena Capital">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={`${p.ruta}${q}`} aria-current={p.id === actual ? "page" : undefined}>
            {p.nombre}
          </Link>
        ))}
      </nav>
      <main className="cap-principal">
        {aviso?.ok ? (
          <p className="cap-aviso ok cap-ancho" role="status">
            ✓ {aviso.ok}
          </p>
        ) : null}
        {aviso?.error ? (
          <p className="cap-aviso error cap-ancho" role="alert">
            ✕ {aviso.error}
          </p>
        ) : null}
        {children}
      </main>
      <footer className="pie">
        <p>
          Mena Capital usa tus propios registros (importados o escritos aquí), el dólar del BCRD y los precios de Finnhub
          cuando existen. Las proyecciones son cálculos con tus supuestos, no pronósticos. No es asesoría de inversión.
          {actualizado ? ` Última edición de tus datos: ${fechaHoraRD(actualizado)} (hora RD).` : ""}
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
