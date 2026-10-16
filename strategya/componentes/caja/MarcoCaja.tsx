// Marco común de las páginas de /caja: encabezado de la app, pestañas del módulo y contenido.

import "@/estilos/caja.css";
import { Encabezado } from "@/componentes/Encabezado";
import { PestanasCaja, type PestanaCaja } from "./PestanasCaja";

// El Encabezado de la app todavía no conoce la sección «caja» (lo agrega el integrador). Mientras
// tanto se le pasa un valor que no marca ninguna pestaña como actual.
const SECCION_CAJA = "caja" as const;

export function MarcoCaja({
  actual,
  mes,
  editadoEn,
  children,
}: {
  actual: PestanaCaja;
  mes?: string;
  editadoEn: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="caja">
      <Encabezado actual={SECCION_CAJA} ultimaActualizacion={editadoEn} />
      <PestanasCaja actual={actual} mes={mes} />
      <main className="terminal">{children}</main>
      <footer className="pie">
        <p>
          Calendario de Caja: cifras de tus propios registros (saldos iniciales, movimientos, recurrentes y cuadres con tu
          banco). Lo planificado es lo que tú programaste, no un pronóstico. No es asesoría de inversión.
        </p>
      </footer>
    </div>
  );
}
