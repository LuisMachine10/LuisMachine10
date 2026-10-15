"use client";

// Calendario del mes (7 columnas que caben a 390 px) y, debajo o al lado, el panel del día elegido.
// Cada día es un botón con aria-pressed y una etiqueta que lee la cifra y el estado completos.

import { useState } from "react";
import type { Fecha } from "@/lib/caja/fechas";
import { NOMBRE_ESTADO } from "@/lib/caja/motor";
import type { VistaMes } from "@/lib/caja/vista";
import type { OpcionCategoria, OpcionCuenta } from "./CamposMovimiento";
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

export function CalendarioCaja({
  vista,
  diaInicial,
  titulo,
  cuentas,
  categorias,
}: {
  vista: VistaMes;
  diaInicial: Fecha;
  titulo: string;
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
}) {
  const [sel, setSel] = useState<Fecha>(diaInicial);
  const panel = vista.paneles[sel];

  const elegir = (f: Fecha) => {
    setSel(f);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("mes", vista.mes);
      u.searchParams.set("dia", f);
      window.history.replaceState(null, "", u);
    } catch {
      // Sin acceso al historial (vista previa): la selección sigue funcionando.
    }
  };

  return (
    <div className="caja-rejilla panel-ancho">
      <section className="panel" aria-labelledby="t-calendario">
        <div className="panel-cuerpo">
          <h2 className="sr-solo" id="t-calendario">
            Calendario de {titulo}
          </h2>
          <div className="caja-cal" role="group" aria-label={`Días de ${titulo}`}>
            {DSEM.map(([c, n]) => (
              <abbr key={n} title={n} className="caja-cal-dsem" style={{ textDecoration: "none" }}>
                {c}
              </abbr>
            ))}
            {vista.semanas.flat().map((d) => {
              const clases = ["caja-dia", d.estado ?? "", d.enMes ? "" : "fuera", d.antesDelInicio ? "antes" : "", d.esHoy ? "hoy" : ""]
                .filter(Boolean)
                .join(" ");
              if (!d.enMes) {
                return (
                  <div key={d.fecha} className={clases} aria-hidden="true">
                    <span className="caja-dia-num">{d.dia}</span>
                    <span className="caja-dia-saldo">{d.abreviado ?? ""}</span>
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
                  title={d.estado ? NOMBRE_ESTADO[d.estado] : undefined}
                  onClick={() => elegir(d.fecha)}
                >
                  <span className="caja-dia-num">{d.dia}</span>
                  <span className="caja-dia-saldo">{d.abreviado ?? "·"}</span>
                  <span className="caja-dia-marcas" aria-hidden="true">
                    {d.estado === "bajo" ? <span className="baja">!</span> : null}
                    {d.ingreso ? <span className="caja-marca-ingreso">↑</span> : null}
                    {d.porConfirmar ? <span className="caja-marca-pendiente">?{d.porConfirmar > 1 ? d.porConfirmar : ""}</span> : null}
                    {d.planificados ? <span className="caja-marca-plan">•{d.planificados > 1 ? d.planificados : ""}</span> : null}
                    {d.registrados ? <span>✓{d.registrados > 1 ? d.registrados : ""}</span> : null}
                    {d.cuadre ? <span>=</span> : null}
                    {d.nota ? <span>✎</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <ul className="caja-leyenda" aria-label="Leyenda">
            <li>
              <span className="caja-marca-ingreso">↑</span> ingreso
            </li>
            <li>
              <span className="caja-marca-plan">•</span> planificado
            </li>
            <li>
              <span className="caja-marca-pendiente">?</span> por confirmar
            </li>
            <li>✓ registrado</li>
            <li>= cuadrado con el banco</li>
            <li>✎ nota</li>
            <li>
              <span className="caja-estado holgado">holgado</span> <span className="caja-estado cerca">cerca</span>{" "}
              <span className="caja-estado bajo">! bajo</span> el colchón
            </li>
          </ul>
          <p className="chico tenue">La cifra de cada día es el disponible al cierre (banco + efectivo), abreviado.</p>
        </div>
      </section>
      {panel ? <PanelDia key={sel} p={panel} cat={{ cuentas, categorias }} /> : null}
    </div>
  );
}
