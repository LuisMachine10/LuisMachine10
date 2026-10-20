"use client";

// Formularios de carga manual. Cada uno llama a su server action y muestra el resultado.

import "@/estilos/rd.css";
import { useActionState } from "react";
import { cargarCombustibles, cargarDato, cargarEmision, cargarFondo, type EstadoCarga } from "@/app/carga/acciones";

export interface SerieCarga {
  id: string;
  nombre: string;
  unidad: string;
}

const INICIAL: EstadoCarga = { ok: null, mensaje: null };

function Resultado({ estado, id }: { estado: EstadoCarga; id: string }) {
  if (!estado.mensaje) return null;
  return (
    <p id={id} className={`rd-mensaje ${estado.ok ? "ok" : "error"}`} role={estado.ok ? "status" : "alert"}>
      <span className="rd-mensaje-icono" aria-hidden="true">
        {estado.ok ? "✓" : "✕"}
      </span>
      <span>{estado.mensaje}</span>
    </p>
  );
}

function Enviar({ enviando, texto }: { enviando: boolean; texto: string }) {
  return (
    <div className="rd-form-acciones">
      <button type="submit" className="boton" disabled={enviando} aria-busy={enviando}>
        {enviando ? "Guardando…" : texto}
      </button>
    </div>
  );
}

function CampoEnlace() {
  return (
    <label>
      Enlace de la fuente
      <input name="enlace" type="url" inputMode="url" placeholder="https://" autoComplete="url" required />
    </label>
  );
}

export function FormularioDato({ series, hoy }: { series: SerieCarga[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(cargarDato, INICIAL);
  return (
    <form action={accion} className="rd-form" aria-describedby="r-dato">
      <label>
        Serie
        <select name="serie" required defaultValue="">
          <option value="" disabled>
            Elige una serie…
          </option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} ({s.unidad}) · {s.id}
            </option>
          ))}
        </select>
      </label>
      <div className="rd-fila">
        <label>
          Fecha del dato
          <input name="fecha" type="date" defaultValue={hoy} required />
        </label>
        <label>
          Valor
          <input name="valor" className="mono" inputMode="decimal" placeholder="5.25" autoComplete="off" required />
        </label>
      </div>
      <CampoEnlace />
      <label>
        <span>
          Nota <span className="rd-opcional">opcional</span>
        </span>
        <input name="nota" maxLength={300} />
      </label>
      <p className="rd-ayuda">Punto decimal, sin comas de miles. Si ya hay un dato oficial de esa fecha, no se reemplaza.</p>
      <Enviar enviando={enviando} texto="Guardar dato" />
      <Resultado estado={estado} id="r-dato" />
    </form>
  );
}

export function FormularioCombustibles({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState(cargarCombustibles, INICIAL);
  const productos = [
    ["COMB_GASOLINA_PREMIUM", "Gasolina premium"],
    ["COMB_GASOLINA_REGULAR", "Gasolina regular"],
    ["COMB_GASOIL_OPTIMO", "Gasoil óptimo"],
    ["COMB_GASOIL_REGULAR", "Gasoil regular"],
    ["COMB_GLP", "GLP"],
  ] as const;
  return (
    <form action={accion} className="rd-form" aria-describedby="r-comb">
      <label>
        Primer día de la semana de vigencia
        <input name="semana" type="date" defaultValue={hoy} required />
      </label>
      <div className="rd-fila">
        {productos.map(([id, nombre]) => (
          <label key={id}>
            <span>
              {nombre} <span className="rd-unidad-campo">RD$/galón</span>
            </span>
            <input name={id} className="mono" inputMode="decimal" placeholder="0.00" autoComplete="off" />
          </label>
        ))}
      </div>
      <CampoEnlace />
      <p className="rd-ayuda">Solo los precios que publique el aviso oficial del MICM. Los vacíos no se guardan.</p>
      <Enviar enviando={enviando} texto="Guardar precios" />
      <Resultado estado={estado} id="r-comb" />
    </form>
  );
}

export function FormularioFondo({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState(cargarFondo, INICIAL);
  return (
    <form action={accion} className="rd-form" aria-describedby="r-fondo">
      <div className="rd-fila">
        <label>
          SAFI
          <input name="safi" required maxLength={120} />
        </label>
        <label>
          Fondo
          <input name="fondo" required maxLength={160} />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          Moneda
          <select name="moneda" required defaultValue="DOP">
            <option value="DOP">RD$</option>
            <option value="USD">US$</option>
          </select>
        </label>
        <label>
          Base (días)
          <select name="plazo" required defaultValue="30">
            <option value="30">30 días</option>
            <option value="360">360 días</option>
            <option value="365">365 días</option>
          </select>
        </label>
        <label>
          Rendimiento %
          <input name="rendimiento" className="mono" inputMode="decimal" placeholder="6.85" autoComplete="off" required />
        </label>
        <label>
          Fecha de corte
          <input name="corte" type="date" defaultValue={hoy} required />
        </label>
      </div>
      <CampoEnlace />
      <label>
        <span>
          Nota <span className="rd-opcional">opcional</span>
        </span>
        <input name="nota" maxLength={300} />
      </label>
      <Enviar enviando={enviando} texto="Guardar rendimiento" />
      <Resultado estado={estado} id="r-fondo" />
    </form>
  );
}

export function FormularioEmision({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState(cargarEmision, INICIAL);
  return (
    <form action={accion} className="rd-form" aria-describedby="r-emision">
      <div className="rd-fila">
        <label>
          Fuente
          <select name="fuente" required defaultValue="SIMV">
            <option value="SIMV">SIMV · resolución (EV / FI)</option>
            <option value="BVRD">BVRD · hecho relevante</option>
          </select>
        </label>
        <label>
          Número
          <input name="numero" required maxLength={80} placeholder="R-SIMV-2026-00-EV" />
        </label>
        <label>
          Fecha
          <input name="fecha" type="date" defaultValue={hoy} required />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          <span>
            Emisor <span className="rd-opcional">opcional</span>
          </span>
          <input name="emisor" maxLength={160} />
        </label>
        <label>
          <span>
            Instrumento <span className="rd-opcional">opcional</span>
          </span>
          <input name="instrumento" maxLength={160} placeholder="Bonos corporativos" />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          <span>
            Monto <span className="rd-opcional">opcional</span>
          </span>
          <input name="monto" className="mono" inputMode="decimal" placeholder="500000000.00" autoComplete="off" />
        </label>
        <label>
          Moneda
          <select name="moneda" defaultValue="">
            <option value="">—</option>
            <option value="DOP">RD$</option>
            <option value="USD">US$</option>
          </select>
        </label>
        <label>
          <span>
            Tasa % <span className="rd-opcional">opcional</span>
          </span>
          <input name="tasa" className="mono" inputMode="decimal" placeholder="9.75" autoComplete="off" />
        </label>
      </div>
      <CampoEnlace />
      <label>
        <span>
          Descripción <span className="rd-opcional">opcional</span>
        </span>
        <textarea name="descripcion" rows={2} maxLength={600} />
      </label>
      <Enviar enviando={enviando} texto="Guardar emisión" />
      <Resultado estado={estado} id="r-emision" />
    </form>
  );
}
