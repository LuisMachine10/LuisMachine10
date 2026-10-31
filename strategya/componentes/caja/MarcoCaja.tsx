// Marco común de las páginas de /caja: encabezado de la app, título «Presupuesto», pestañas del módulo y el contenido.
// Sin bajadas descriptivas: la pestaña y sus botones dicen qué se hace (solo el asistente lleva una línea).

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
  /** Una línea corta solo donde sin ella no se entiende qué hacer (el asistente de bienvenida). */
  sub?: string;
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
        </div>
        {acciones ? <div className="caja-cabeza-acciones">{acciones}</div> : null}
      </div>
      {sinPestanas ? null : <PestanasCaja actual={actual} mes={mes} />}
      {sub ? <p className="caja-para-pestana">{sub}</p> : null}
      <main className="terminal caja-terminal">{children}</main>
      <footer className="pie">
        <p>Las cifras salen de lo que tú anotas. No es asesoría de inversión.</p>
        <p className="pie-legal">
          <a href="/terminos">Términos y privacidad</a>
        </p>
      </footer>
    </div>
  );
}
