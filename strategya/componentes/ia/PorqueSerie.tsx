// «¿Por qué se movió?» bajo una serie: 1–2 oraciones redactadas con IA solo con titulares guardados, con sus
// enlaces; o «causa no confirmada». El módulo que muestra la serie carga los porqués con `porques()` de
// lib/datos-alertas-ia.ts y pasa el de cada serie.

import "@/estilos/alertas-ia.css";
import type { Porque } from "@/lib/datos-alertas-ia";
import { fechaHoraRD, hace } from "@/lib/formato";

export function PorqueSerie({ p, ahora }: { p: Porque | undefined; ahora: Date }) {
  if (!p) return null;
  return (
    <div className={`porque ${p.confirmada ? "" : "no-confirmado"}`}>
      <span className="porque-etiqueta">¿Por qué?</span> <span>{p.texto}</span>{" "}
      {p.fuentes.map((f) => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="chico" title={f.titulo}>
          [{f.titulo.length > 40 ? `${f.titulo.slice(0, 40)}…` : f.titulo} ↗]
        </a>
      ))}{" "}
      <span className="tenue chico" title={fechaHoraRD(p.fecha)}>
        · IA, {hace(p.fecha, ahora)}
      </span>
    </div>
  );
}
