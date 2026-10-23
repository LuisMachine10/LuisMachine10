// Marco común de las páginas de /caja: encabezado de la app, título «Presupuesto» con su línea del menú
// (SECCIONES), pestañas del módulo, una línea de qué hace la pestaña y el contenido.

import "@/estilos/caja.css";
import { Encabezado, SECCIONES } from "@/componentes/Encabezado";
import { PestanasCaja, type PestanaCaja } from "./PestanasCaja";

const SECCION = SECCIONES.find((s) => s.clave === "caja")!;

export function MarcoCaja({
  actual,
  mes,
  editadoEn,
  sub,
  acciones,
  sinPestanas = false,
  children,
}: {
  actual: PestanaCaja;
  mes?: string;
  editadoEn: string | null;
  /** Qué haces en esta pestaña, en una línea («Aquí ves…»). */
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
          <h1>{SECCION.nombre}</h1>
          <p>{SECCION.para}</p>
        </div>
        {acciones ? <div className="caja-cabeza-acciones">{acciones}</div> : null}
      </div>
      {sinPestanas ? null : <PestanasCaja actual={actual} mes={mes} />}
      <p className="caja-para-pestana">{sub}</p>
      <main className="terminal caja-terminal">{children}</main>
      <footer className="pie">
        <p>
          Presupuesto: las cifras salen de lo que tú anotas (categorías, pagos fijos, movimientos, saldos de hoy y cuadres con tu banco).
          Lo presupuestado es lo que tú planificaste, no un pronóstico. No es asesoría de inversión.
        </p>
      </footer>
    </div>
  );
}
