"use client";

// Formularios de carga manual. Cada uno llama a su server action y muestra el resultado.
// Etiquetas visibles, ejemplos en el placeholder, montos con su moneda a la vista y nunca datos personales
// (ni cuentas, ni tarjetas, ni cédula): basta el nombre que aparece en la fuente.

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
      <button type="submit" className="boton rd-boton-grande" disabled={enviando} aria-busy={enviando}>
        {enviando ? "Guardando…" : texto}
      </button>
    </div>
  );
}

function CampoEnlace() {
  return (
    <label>
      Enlace de donde sacaste el dato
      <input name="enlace" type="url" inputMode="url" placeholder="Ej.: https://www.bancentral.gov.do/…" autoComplete="url" required />
    </label>
  );
}

function Opcional() {
  return <span className="rd-opcional">opcional</span>;
}

export function FormularioDato({ series, hoy }: { series: SerieCarga[]; hoy: string }) {
  const [estado, accion, enviando] = useActionState(cargarDato, INICIAL);
  return (
    <form action={accion} className="rd-form" aria-describedby="r-dato">
      <label>
        ¿Qué cifra es?
        <select name="serie" required defaultValue="">
          <option value="" disabled>
            Elige la cifra…
          </option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre} ({s.unidad})
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
          <input name="valor" className="mono" inputMode="decimal" placeholder="Ej.: 5.25" autoComplete="off" required />
        </label>
      </div>
      <CampoEnlace />
      <label>
        <span>
          Nota <Opcional />
        </span>
        <input name="nota" maxLength={300} placeholder="Ej.: Comunicado del 30 de octubre" />
      </label>
      <p className="rd-ayuda">Usa punto para los decimales y sin comas de miles (1525.40). Si ya hay un dato oficial de esa fecha, no se reemplaza.</p>
      <Enviar enviando={enviando} texto="Guardar dato" />
      <Resultado estado={estado} id="r-dato" />
    </form>
  );
}

const PRODUCTOS = [
  ["COMB_GASOLINA_PREMIUM", "Gasolina premium"],
  ["COMB_GASOLINA_REGULAR", "Gasolina regular"],
  ["COMB_GASOIL_OPTIMO", "Gasoil óptimo"],
  ["COMB_GASOIL_REGULAR", "Gasoil regular"],
  ["COMB_GLP", "GLP (gas de cocina)"],
] as const;

export function FormularioCombustibles({ hoy }: { hoy: string }) {
  const [estado, accion, enviando] = useActionState(cargarCombustibles, INICIAL);
  return (
    <form action={accion} className="rd-form" aria-describedby="r-comb">
      <label className="rd-campo-medio">
        Primer día de la semana de vigencia (sábado)
        <input name="semana" type="date" defaultValue={hoy} required />
      </label>
      <div className="rd-fila rd-fila-precios">
        {PRODUCTOS.map(([id, nombre]) => (
          <label key={id}>
            {nombre}
            <span className="rd-con-moneda">
              <span className="rd-prefijo" aria-hidden="true">
                RD$
              </span>
              <input name={id} className="mono" inputMode="decimal" placeholder="Ej.: 290.10" autoComplete="off" aria-label={`${nombre}, RD$ por galón`} />
            </span>
            <span className="rd-unidad-campo">por galón</span>
          </label>
        ))}
      </div>
      <CampoEnlace />
      <p className="rd-ayuda">Escribe solo los precios del aviso oficial del MICM. Las casillas vacías no se guardan.</p>
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
          Administradora (SAFI / AFI)
          <input name="safi" required maxLength={120} placeholder="Ej.: AFI Popular" />
        </label>
        <label>
          Nombre del fondo
          <input name="fondo" required maxLength={160} placeholder="Ej.: Fondo Abierto Liquidez" />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          Moneda del fondo
          <select name="moneda" required defaultValue="DOP">
            <option value="DOP">Pesos (RD$)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </label>
        <label>
          Periodo del rendimiento
          <select name="plazo" required defaultValue="30">
            <option value="30">Últimos 30 días</option>
            <option value="360">Último año (base 360 días)</option>
            <option value="365">Último año (base 365 días)</option>
          </select>
        </label>
        <label>
          Rendimiento anual
          <span className="rd-con-moneda">
            <input name="rendimiento" className="mono" inputMode="decimal" placeholder="Ej.: 6.85" autoComplete="off" required />
            <span className="rd-sufijo" aria-hidden="true">
              %
            </span>
          </span>
        </label>
        <label>
          Fecha de corte
          <input name="corte" type="date" defaultValue={hoy} required />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          <span>
            Valor cuota <Opcional />
          </span>
          <input name="valor_cuota" className="mono" inputMode="decimal" placeholder="Ej.: 1250.4321" autoComplete="off" />
        </label>
        <label>
          <span>
            Nota <Opcional />
          </span>
          <input name="nota" maxLength={300} placeholder="Ej.: Hoja informativa de octubre" />
        </label>
      </div>
      <CampoEnlace />
      <p className="rd-ayuda">
        Copia el rendimiento tal como lo publica la SAFI (ya viene en tasa anual). Si publica 30 días y 1 año, guárdalos por separado.
      </p>
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
          ¿De dónde es?
          <select name="fuente" required defaultValue="SIMV">
            <option value="SIMV">SIMV · resolución (EV / FI)</option>
            <option value="BVRD">BVRD · hecho relevante</option>
          </select>
        </label>
        <label>
          Número
          <input name="numero" required maxLength={80} placeholder="Ej.: R-SIMV-2026-25-EV" />
        </label>
        <label>
          Fecha
          <input name="fecha" type="date" defaultValue={hoy} required />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          <span>
            Emisor <Opcional />
          </span>
          <input name="emisor" maxLength={160} placeholder="Ej.: Banco Ejemplo, S. A." />
        </label>
        <label>
          <span>
            Instrumento <Opcional />
          </span>
          <input name="instrumento" maxLength={160} placeholder="Ej.: Bonos corporativos" />
        </label>
      </div>
      <div className="rd-fila">
        <label>
          <span>
            Moneda <Opcional />
          </span>
          <select name="moneda" defaultValue="">
            <option value="">Sin monto</option>
            <option value="DOP">Pesos (RD$)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </label>
        <label>
          <span>
            Monto <Opcional />
          </span>
          <input name="monto" className="mono" inputMode="decimal" placeholder="Ej.: 500000000.00" autoComplete="off" />
        </label>
        <label>
          <span>
            Tasa <Opcional />
          </span>
          <span className="rd-con-moneda">
            <input name="tasa" className="mono" inputMode="decimal" placeholder="Ej.: 9.75" autoComplete="off" />
            <span className="rd-sufijo" aria-hidden="true">
              %
            </span>
          </span>
        </label>
      </div>
      <CampoEnlace />
      <label>
        <span>
          Descripción <Opcional />
        </span>
        <textarea name="descripcion" rows={2} maxLength={600} placeholder="Ej.: Aprueba el programa de emisiones por RD$ 500 millones" />
      </label>
      <Enviar enviando={enviando} texto="Guardar" />
      <Resultado estado={estado} id="r-emision" />
    </form>
  );
}
