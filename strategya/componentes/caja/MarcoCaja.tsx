// Marco común de las páginas de /caja: encabezado de la app, título de la pantalla con una línea
// en palabras simples, pestañas del módulo y contenido.

import "@/estilos/caja.css";
import { Encabezado } from "@/componentes/Encabezado";
import { PestanasCaja, type PestanaCaja } from "./PestanasCaja";

export function MarcoCaja({
  actual,
  mes,
  editadoEn,
  titulo,
  sub,
  acciones,
  sinPestanas = false,
  children,
}: {
  actual: PestanaCaja;
  mes?: string;
  editadoEn: string | null;
  titulo: string;
  /** Para qué sirve la pantalla, en una línea («Aquí ves…»). */
  sub: string;
  /** Acción principal (y secundarias) de la pantalla. */
  acciones?: React.ReactNode;
  /** El asistente de bienvenida no muestra pestañas: todavía no hay nada que ver en ellas. */
  sinPestanas?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="caja">
      <Encabezado actual="caja" ultimaActualizacion={editadoEn} />
      <div className="caja-cabeza">
        <div className="caja-cabeza-texto">
          <h1>{titulo}</h1>
          <p>{sub}</p>
        </div>
        {acciones ? <div className="caja-cabeza-acciones">{acciones}</div> : null}
      </div>
      {sinPestanas ? null : <PestanasCaja actual={actual} mes={mes} />}
      <main className="terminal caja-terminal">{children}</main>
      <footer className="pie">
        <p>
          Calendario de caja: las cifras salen de lo que tú anotas (saldos de hoy, movimientos, pagos fijos y cuadres con tu banco). Lo
          programado es lo que tú programaste, no un pronóstico. No es asesoría de inversión.
        </p>
      </footer>
    </div>
  );
}
