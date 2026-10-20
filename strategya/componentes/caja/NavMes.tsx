import Link from "next/link";
import { type Mes, nombreMes, sumarMeses } from "@/lib/caja/fechas";
import { Icono } from "./Iconos";

/** Mes anterior / siguiente con enlaces (funciona sin JavaScript). */
export function NavMes({ mes, ruta, hoyMes }: { mes: Mes; ruta: string; hoyMes: Mes }) {
  const antes = sumarMeses(mes, -1);
  const despues = sumarMeses(mes, 1);
  return (
    <div className="caja-mes-nav">
      <h2>{nombreMes(mes)}</h2>
      <span className="caja-mes-botones">
        {mes !== hoyMes ? (
          <Link href={ruta} className="caja-mes-hoy" aria-label="Volver al mes de hoy">
            Hoy
          </Link>
        ) : null}
        <Link href={`${ruta}?mes=${antes}`} aria-label={`Mes anterior: ${nombreMes(antes)}`} title={`Mes anterior: ${nombreMes(antes)}`}>
          <Icono n="izquierda" tam={18} />
        </Link>
        <Link href={`${ruta}?mes=${despues}`} aria-label={`Mes siguiente: ${nombreMes(despues)}`} title={`Mes siguiente: ${nombreMes(despues)}`}>
          <Icono n="derecha" tam={18} />
        </Link>
      </span>
    </div>
  );
}
