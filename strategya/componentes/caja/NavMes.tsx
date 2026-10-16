import Link from "next/link";
import { type Mes, nombreMes, sumarMeses } from "@/lib/caja/fechas";

/** Mes anterior / siguiente con enlaces (funciona sin JavaScript). */
export function NavMes({ mes, ruta, hoyMes }: { mes: Mes; ruta: string; hoyMes: Mes }) {
  const antes = sumarMeses(mes, -1);
  const despues = sumarMeses(mes, 1);
  return (
    <div className="caja-mes-nav">
      <Link href={`${ruta}?mes=${antes}`} aria-label={`Mes anterior: ${nombreMes(antes)}`}>
        ←
      </Link>
      <h2>{nombreMes(mes)}</h2>
      <span className="caja-acciones">
        {mes !== hoyMes ? (
          <Link href={ruta} aria-label="Volver al mes de hoy">
            Hoy
          </Link>
        ) : null}
        <Link href={`${ruta}?mes=${despues}`} aria-label={`Mes siguiente: ${nombreMes(despues)}`}>
          →
        </Link>
      </span>
    </div>
  );
}
