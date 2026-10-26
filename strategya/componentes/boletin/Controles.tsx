"use client";

// Controles interactivos del Boletín: «Vista previa ahora» / «Enviar prueba» y las casillas de Ajustes.

import Link from "next/link";
import { useActionState, useState } from "react";
import type { PrefBoletin } from "@/lib/boletin/preferencias";
import type { TipoEdicion } from "@/supabase/functions/_shared/boletin/tipos";
import { enviarPrueba, type EstadoAccion, guardarAjustesBoletin } from "./acciones";

const OPCIONES: { tipo: TipoEdicion; nombre: string }[] = [
  { tipo: "am", nombre: "Bitácora · AM" },
  { tipo: "cierre", nombre: "Bitácora · Cierre" },
  { tipo: "finde", nombre: "Fin de semana · Materias primas" },
  { tipo: "tasas", nombre: "Boletín de Tasas RD" },
];

export function PanelProbar({ inicial = "am" }: { inicial?: TipoEdicion }) {
  const [tipo, setTipo] = useState<TipoEdicion>(inicial);
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(enviarPrueba, { ok: null, mensaje: null });
  return (
    <div className="bol-probar">
      <label className="bol-campo">
        <span>Edición</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEdicion)}>
          {OPCIONES.map((o) => (
            <option key={o.tipo} value={o.tipo}>
              {o.nombre}
            </option>
          ))}
        </select>
      </label>
      <div className="bol-botones">
        <Link href={`/boletin/vista-previa?tipo=${tipo}`} className="boton">
          Vista previa ahora
        </Link>
        <form action={accion}>
          <input type="hidden" name="tipo" value={tipo} />
          <button type="submit" className="boton secundario" disabled={enviando}>
            {enviando ? "Pidiendo…" : "Enviar prueba"}
          </button>
        </form>
      </div>
      {estado.mensaje ? (
        <p role="status" className={`chico bol-estado ${estado.ok ? "sube" : "baja"}`}>
          {estado.mensaje}
        </p>
      ) : (
        <p className="chico tenue bol-estado">
          La vista previa arma la edición con los datos de este momento y no la envía. La prueba llega solo a tu correo y se guarda marcada «Prueba».
        </p>
      )}
    </div>
  );
}

const CASILLAS: { k: keyof PrefBoletin; nombre: string; que: string }[] = [
  { k: "am", nombre: "Bitácora · AM", que: "Lunes a viernes, 7:35 AM: cómo amanecen los mercados, RD y el mundo." },
  { k: "cierre", nombre: "Bitácora · Cierre", que: "Lunes a viernes, 5:05 PM: qué cambió desde la mañana." },
  { k: "finde", nombre: "Fin de semana · Materias primas", que: "Sábado y domingo, 7:35 AM: cierre semanal y la semana que viene." },
  { k: "tasas", nombre: "Boletín de Tasas RD", que: "Lunes, 6:40 AM: TPM, tasas de los bancos, subastas y fondos." },
  { k: "tu_dinero", nombre: "Incluir «Tu dinero» en el correo", que: "Tu utilidad del mes, patrimonio, aportes pendientes y riesgos altos. Solo te llega a ti." },
];

export function AjustesBoletin({ inicial }: { inicial: PrefBoletin }) {
  const [estado, accion, guardando] = useActionState<EstadoAccion, FormData>(guardarAjustesBoletin, { ok: null, mensaje: null });
  return (
    <form action={accion} className="bol-ajustes">
      <fieldset>
        <legend className="sr-solo">Qué boletines quieres recibir</legend>
        {CASILLAS.map((c) => (
          <label key={c.k} className={`bol-casilla${c.k === "tu_dinero" ? " bol-casilla-personal" : ""}`}>
            <input type="checkbox" name={c.k} defaultChecked={inicial[c.k]} />
            <span>
              <strong>{c.nombre}</strong>
              <small>{c.que}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="bol-botones">
        <button type="submit" className="boton" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {estado.mensaje ? (
          <span role="status" className={`chico ${estado.ok ? "sube" : "baja"}`}>
            {estado.mensaje}
          </span>
        ) : null}
      </div>
    </form>
  );
}
