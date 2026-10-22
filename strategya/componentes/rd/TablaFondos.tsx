"use client";

// Tabla de fondos con filtros: SAFI/AFI, moneda, periodo (30 días o 1 año) y orden por rendimiento.
// Las cifras se muestran tal como las publicó la fuente (texto); el orden se compara con big.js.

import { useMemo, useState } from "react";
import { cifra, fechaCorta } from "@/lib/formato";
import { type FiltroFondos, type FondoVista, filtrarFondos } from "@/lib/rd";

export interface FondoFila extends FondoVista {
  fuente: string;
}

const INICIAL: FiltroFondos = { safi: "", moneda: "", periodo: "ambos", orden: "mayor" };

const MONEDA = { DOP: "RD$", USD: "US$" } as const;

function Rendimiento({ c, corte, etiqueta }: { c: FondoVista["r30"]; corte: string; etiqueta: string }) {
  if (!c) {
    return (
      <span className="rd-sin-cifra" title={`La fuente no publica el rendimiento a ${etiqueta}`}>
        sin dato
      </span>
    );
  }
  return (
    <>
      <span className="rd-rend mono">{cifra(c.rendimiento, 2)}%</span>
      {c.plazo_dias !== 30 ? <span className="rd-rend-base">base {c.plazo_dias} d</span> : null}
      {c.fecha_corte !== corte ? <span className="rd-rend-base">al {fechaCorta(c.fecha_corte, false)}</span> : null}
    </>
  );
}

export function TablaFondos({ fondos }: { fondos: FondoFila[] }) {
  const [f, setF] = useState<FiltroFondos>(INICIAL);
  const safis = useMemo(() => [...new Set(fondos.map((x) => x.safi))].sort((a, b) => a.localeCompare(b, "es")), [fondos]);
  const lista = useMemo(() => filtrarFondos(fondos, f) as FondoFila[], [fondos, f]);
  const cambiado = f.safi !== INICIAL.safi || f.moneda !== INICIAL.moneda || f.periodo !== INICIAL.periodo || f.orden !== INICIAL.orden;
  const ordenCol = f.orden === "nombre" ? null : f.periodo === "1a" ? "1a" : "30";
  const ariaSort = (col: "30" | "1a") => (ordenCol === col ? (f.orden === "mayor" ? "descending" : "ascending") : undefined);

  return (
    <div className="rd-fondos">
      <div className="rd-filtros" role="group" aria-label="Filtrar fondos">
        <label>
          SAFI / AFI
          <select value={f.safi} onChange={(e) => setF({ ...f, safi: e.target.value })}>
            <option value="">Todas ({safis.length})</option>
            {safis.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Moneda
          <select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as FiltroFondos["moneda"] })}>
            <option value="">Pesos y dólares</option>
            <option value="DOP">Solo RD$</option>
            <option value="USD">Solo US$</option>
          </select>
        </label>
        <label>
          Periodo
          <select value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value as FiltroFondos["periodo"] })}>
            <option value="ambos">30 días y 1 año</option>
            <option value="30">Solo 30 días</option>
            <option value="1a">Solo 1 año</option>
          </select>
        </label>
        <label>
          Ordenar por
          <select value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value as FiltroFondos["orden"] })}>
            <option value="mayor">El que más rinde</option>
            <option value="menor">El que menos rinde</option>
            <option value="nombre">Nombre (A–Z)</option>
          </select>
        </label>
      </div>
      <div className="rd-fondos-resumen" aria-live="polite">
        <span>
          {lista.length} de {fondos.length} fondos
          {ordenCol ? <span className="tenue"> · ordenados por {ordenCol === "1a" ? "1 año" : "30 días"}</span> : null}
        </span>
        {cambiado ? (
          <button type="button" className="boton secundario rd-boton-chico" onClick={() => setF(INICIAL)}>
            Quitar filtros
          </button>
        ) : null}
      </div>

      {lista.length === 0 ? (
        <div className="rd-sin-dato rd-sin-dato-caja">
          <p>Ningún fondo cumple estos filtros. Prueba con otra moneda o con «30 días y 1 año».</p>
          <button type="button" className="boton secundario rd-boton-chico" onClick={() => setF(INICIAL)}>
            Quitar filtros
          </button>
        </div>
      ) : (
        <table className="tabla rd-tabla-fondos">
          <caption className="sr-solo">Fondos de inversión abiertos de RD: rendimiento anualizado a 30 días y a 1 año, valor cuota, fecha de corte y fuente</caption>
          <thead>
            <tr>
              <th scope="col">Fondo</th>
              <th scope="col">Moneda</th>
              <th scope="col" className="num" aria-sort={ariaSort("30")}>
                30 días
              </th>
              <th scope="col" className="num" aria-sort={ariaSort("1a")}>
                1 año
              </th>
              <th scope="col" className="num">
                Valor cuota
              </th>
              <th scope="col">Corte · fuente</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.clave}>
                <th scope="row" className="rd-fondo-nombre">
                  <span className="rd-fondo-titulo">{x.fondo}</span>
                  <span className="rd-fondo-safi">{x.safi}</span>
                </th>
                <td className="rd-fondo-moneda" data-etiqueta="Moneda">
                  <span className="etiqueta neutra">{MONEDA[x.moneda]}</span>
                </td>
                <td className={`num rd-fondo-r${ordenCol === "30" ? " rd-col-orden" : ""}`} data-etiqueta="30 días">
                  <Rendimiento c={x.r30} corte={x.corte} etiqueta="30 días" />
                </td>
                <td className={`num rd-fondo-r${ordenCol === "1a" ? " rd-col-orden" : ""}`} data-etiqueta="1 año">
                  <Rendimiento c={x.r1a} corte={x.corte} etiqueta="1 año" />
                </td>
                <td className="num rd-fondo-cuota" data-etiqueta="Valor cuota">
                  {x.valorCuota ? (
                    <span className="mono" title={`Valor de una cuota al ${fechaCorta(x.valorCuota.fecha_corte)}`}>
                      {MONEDA[x.moneda]} {cifra(x.valorCuota.valor, 4)}
                    </span>
                  ) : (
                    <span className="rd-sin-cifra" title="La fuente no publica el valor cuota">
                      sin dato
                    </span>
                  )}
                </td>
                <td className="rd-fondo-fuente" data-etiqueta="Corte">
                  <span className="sello">
                    <span className="mono" title={`Fecha de corte: ${fechaCorta(x.corte)}`}>
                      {fechaCorta(x.corte, false)}
                    </span>
                    <a href={x.url} target="_blank" rel="noopener noreferrer">
                      {x.fuente} <span aria-hidden="true">↗</span>
                      <span className="sr-solo"> (abre la fuente en otra pestaña)</span>
                    </a>
                    {x.viejo ? (
                      <span className="rd-pildora-vieja" title="El corte tiene más de 10 días: es la última cifra publicada">
                        Dato viejo
                      </span>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
