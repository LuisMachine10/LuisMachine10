// Tarjeta de una subasta de Hacienda (Crédito Público): monto adjudicado, tasa de corte, cobertura y
// vencimiento, con el aviso ⚠ cuando el Consolidado no cuadra. Cada cifra con su sello de fuente.

import Big from "big.js";
import { SelloFuente } from "@/componentes/SelloFuente";
import type { EmisionRD, EstadoTareaRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { Icono, ICONOS_RD } from "./comun";
import { leerResumenSubasta } from "./subasta";

const MONEDA: Record<string, string> = { USD: "US$", DOP: "RD$" };

/** Monto en millones para la tarjeta ("20000000000" → "20,000.0"); la cifra completa va en el title. */
function enMillones(monto: string): string {
  return cifra(new Big(monto).div(1_000_000).toString(), 1);
}

export function TarjetaSubasta({
  e,
  tarea,
  fuenteNombre,
  ahora,
  destacada = false,
}: {
  e: EmisionRD;
  tarea?: EstadoTareaRD;
  fuenteNombre: string;
  ahora: Date;
  destacada?: boolean;
}) {
  const r = leerResumenSubasta(e.descripcion);
  const moneda = e.moneda ? (MONEDA[e.moneda] ?? e.moneda) : "RD$";
  const [codigo, ...resto] = (e.instrumento ?? e.numero).split(" · ");
  const titulo = resto.length ? resto.join(" · ") : codigo;
  const id = `subasta-${e.id}`;
  return (
    <article className={`rd-subasta${destacada ? " rd-subasta-destacada" : ""}`} aria-labelledby={id}>
      <div className="rd-subasta-cabeza">
        <time className="rd-fecha-chip mono" dateTime={e.fecha}>
          {fechaCorta(e.fecha)}
        </time>
        {resto.length ? <span className="etiqueta neutra mono">{codigo}</span> : null}
        {e.origen === "manual" ? <span className="etiqueta alerta">carga manual</span> : null}
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="rd-subasta-doc" title="Resultado oficial">
          <Icono d={ICONOS_RD.documento} tam={15} />
          <span className="sr-solo">Resultado oficial de la subasta del {fechaCorta(e.fecha)}</span>
        </a>
      </div>
      <h4 className="rd-subasta-titulo" id={id}>
        {titulo}
      </h4>

      {e.monto || e.tasa || r.cobertura ? (
        <dl className="rd-subasta-cifras">
          {e.monto ? (
            <div>
              <dt>Adjudicado</dt>
              <dd title={`${moneda} ${cifra(e.monto, 2)}`}>
                <span className="rd-subasta-num mono">{enMillones(e.monto)}</span> <span className="rd-subasta-u">MM {moneda}</span>
              </dd>
            </div>
          ) : null}
          {e.tasa ? (
            <div>
              <dt>Tasa de corte</dt>
              <dd>
                <span className="rd-subasta-num mono">{cifra(e.tasa, 4)}%</span>
              </dd>
            </div>
          ) : null}
          {r.cobertura ? (
            <div>
              <dt>Cobertura</dt>
              <dd title={r.subastadoMM && r.demandadoMM ? `Demandado RD$ ${r.demandadoMM} MM sobre RD$ ${r.subastadoMM} MM subastados` : undefined}>
                <span className="rd-subasta-num mono">{r.cobertura}×</span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="rd-subasta-nota">Monto y tasa de corte: solo en el PDF oficial (no se muestran cifras que no se pudieron leer).</p>
      )}

      {r.subastadoMM || r.demandadoMM || r.vence ? (
        <p className="rd-subasta-detalle">
          {[
            r.subastadoMM ? `Subastado RD$ ${r.subastadoMM} MM` : null,
            r.demandadoMM ? `demandado RD$ ${r.demandadoMM} MM` : null,
            r.vence ? `vence el ${fechaCorta(r.vence)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {r.aviso ? (
        <p className="rd-aviso" role="note">
          <Icono d={ICONOS_RD.aviso} tam={15} />
          <span>
            <span className="sr-solo">Aviso: </span>
            {r.aviso}
          </span>
        </p>
      ) : null}

      <SelloFuente
        ahora={ahora}
        d={{
          fuente: e.origen === "manual" ? "Carga manual" : fuenteNombre,
          url: e.url,
          fechaDato: e.fecha,
          verificadoEn: e.origen === "manual" ? e.recogido_en : (tarea?.ultima_ok ?? e.recogido_en),
          desactualizado: false,
          ultimaCorridaFallo: e.origen !== "manual" && tarea?.estado === "error",
        }}
      />
    </article>
  );
}
