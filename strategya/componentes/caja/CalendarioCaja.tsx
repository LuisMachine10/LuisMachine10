"use client";

// Calendario del mes (7 columnas que caben a 390 px) y el panel del día elegido: al lado en
// escritorio, como hoja que sube desde abajo en el celular. Cada día es un botón con aria-pressed y
// una etiqueta que lee la cifra y el estado completos.

import { useCallback, useEffect, useState } from "react";
import { type Fecha, fechaLarga } from "@/lib/caja/fechas";
import { rd } from "@/lib/caja/formato";
import { NOMBRE_ESTADO } from "@/lib/caja/motor";
import type { TipoMovimiento } from "@/lib/caja/tipos";
import type { VistaMes } from "@/lib/caja/vista";
import { EVENTO_NUEVO } from "./BotonesNuevo";
import type { OpcionCategoria, OpcionCuenta } from "./CamposMovimiento";
import { Icono } from "./Iconos";
import { NuevoMovimiento } from "./NuevoMovimiento";
import { PanelDia } from "./PanelDia";

const DSEM = [
  ["L", "lunes"],
  ["M", "martes"],
  ["M", "miércoles"],
  ["J", "jueves"],
  ["V", "viernes"],
  ["S", "sábado"],
  ["D", "domingo"],
] as const;

const CELULAR = "(max-width: 999px)";

export function CalendarioCaja({
  vista,
  diaInicial,
  titulo,
  cuentas,
  categorias,
  nav,
}: {
  vista: VistaMes;
  diaInicial: Fecha;
  titulo: string;
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
  /** Navegación del mes (enlaces del servidor). */
  nav: React.ReactNode;
}) {
  const [sel, setSel] = useState<Fecha>(diaInicial);
  const [hoja, setHoja] = useState(false);
  const [nuevo, setNuevo] = useState<TipoMovimiento | null>(null);
  const panel = vista.paneles[sel];
  const cerrarHoja = useCallback(() => setHoja(false), []);

  useEffect(() => {
    const oir = (e: Event) => {
      const t = (e as CustomEvent<TipoMovimiento>).detail;
      if (t) setNuevo(t);
    };
    window.addEventListener(EVENTO_NUEVO, oir);
    return () => window.removeEventListener(EVENTO_NUEVO, oir);
  }, []);

  const elegir = (f: Fecha) => {
    setSel(f);
    try {
      if (window.matchMedia(CELULAR).matches) setHoja(true);
      const u = new URL(window.location.href);
      u.searchParams.set("mes", vista.mes);
      u.searchParams.set("dia", f);
      window.history.replaceState(null, "", u);
    } catch {
      // Sin acceso al historial (vista previa): la selección sigue funcionando.
    }
  };

  const celdaSel = vista.semanas.flat().find((c) => c.fecha === sel);

  return (
    <div className="caja-rejilla panel-ancho">
      <section className="panel caja-cal-panel" aria-labelledby="t-calendario">
        <div className="caja-cal-cabeza">
          <h2 className="sr-solo" id="t-calendario">
            Calendario de {titulo}
          </h2>
          {nav}
        </div>
        <div className="caja-cal" role="group" aria-label={`Días de ${titulo}`}>
          {DSEM.map(([c, n]) => (
            <abbr key={n} title={n} className="caja-cal-dsem">
              {c}
            </abbr>
          ))}
          {vista.semanas.flat().map((d) => {
            const clases = ["caja-dia", d.estado ?? "sin-dato", d.enMes ? "" : "fuera", d.antesDelInicio ? "antes" : "", d.esHoy ? "hoy" : ""]
              .filter(Boolean)
              .join(" ");
            if (!d.enMes) {
              return (
                <div key={d.fecha} className={clases} aria-hidden="true">
                  <span className="caja-dia-num">{d.dia}</span>
                </div>
              );
            }
            return (
              <button
                key={d.fecha}
                type="button"
                className={clases}
                aria-pressed={sel === d.fecha}
                aria-label={d.etiqueta}
                aria-current={d.esHoy ? "date" : undefined}
                title={d.estado ? NOMBRE_ESTADO[d.estado] : d.antesDelInicio ? "Antes de que empezara tu calendario" : undefined}
                onClick={() => elegir(d.fecha)}
              >
                <span className="caja-dia-num">{d.dia}</span>
                <span className="caja-dia-saldo mono">{d.abreviado ?? ""}</span>
                <span className="caja-dia-puntos" aria-hidden="true">
                  {d.ingreso ? <span className="punto ingreso" /> : null}
                  {d.gasto ? <span className="punto gasto" /> : null}
                  {d.planificados ? <span className="punto plan" /> : null}
                  {d.porConfirmar ? <span className="punto pendiente" /> : null}
                  {d.cuadre ? <span className="marca">✓</span> : null}
                  {d.nota ? <span className="marca">✎</span> : null}
                </span>
              </button>
            );
          })}
        </div>
        <details className="caja-leyenda-caja">
          <summary>¿Cómo leo el calendario?</summary>
          <p className="chico tenue">La cifra de cada día es lo que tendrás al final de ese día en banco + efectivo (abreviada: 12.3k = RD$ 12,300).</p>
          <ul className="caja-leyenda" aria-label="Leyenda">
            <li>
              <span className="punto ingreso" aria-hidden="true" /> entra dinero
            </li>
            <li>
              <span className="punto gasto" aria-hidden="true" /> gasto anotado
            </li>
            <li>
              <span className="punto plan" aria-hidden="true" /> pago o cobro programado
            </li>
            <li>
              <span className="punto pendiente" aria-hidden="true" /> por confirmar
            </li>
            <li>
              <span className="caja-leyenda-celda bajo" aria-hidden="true" /> bajo tu mínimo
            </li>
            <li>
              <span className="caja-leyenda-celda cerca" aria-hidden="true" /> cerca del mínimo
            </li>
            <li>
              <span className="caja-leyenda-celda sin-dato" aria-hidden="true" /> sin dato (antes de empezar)
            </li>
            <li>✓ cuadrado con tu banco</li>
            <li>✎ tiene nota</li>
          </ul>
        </details>
      </section>

      {panel && celdaSel ? (
        <button type="button" className="caja-dia-breve" onClick={() => setHoja(true)} aria-haspopup="dialog">
          <span className="caja-dia-breve-texto">
            <span className="caja-dia-breve-fecha">
              {fechaLarga(sel).replace(/ de \d{4}$/, "")}
              {celdaSel.esHoy ? " · hoy" : ""}
            </span>
            <span className="chico tenue">
              {[
                panel.planificados.length ? `${panel.planificados.length} programado(s)` : null,
                panel.porConfirmar.length ? `${panel.porConfirmar.length} por confirmar` : null,
                panel.registrados.length ? `${panel.registrados.length} anotado(s)` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Nada anotado"}
            </span>
          </span>
          <span className={`caja-dia-breve-cifra mono ${panel.estado === "bajo" ? "baja" : ""}`}>{panel.disponible ? rd(panel.disponible) : "sin dato"}</span>
          <Icono n="derecha" tam={18} />
        </button>
      ) : null}

      {panel ? (
        <PanelDia
          key={sel}
          p={panel}
          cat={{ cuentas, categorias }}
          abierta={hoja}
          cerrar={cerrarHoja}
          nuevo={(t) => setNuevo(t)}
        />
      ) : null}
      {hoja ? <div className="caja-hoja-fondo" onClick={cerrarHoja} aria-hidden="true" /> : null}

      <NuevoMovimiento tipo={nuevo} fecha={sel} cuentas={cuentas} categorias={categorias} cerrar={() => setNuevo(null)} />
    </div>
  );
}
