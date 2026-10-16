// Sello de las cifras de la caja: la fuente son los registros de Mena; la fecha del dato es el último
// cuadre con el banco (lo último verificado contra una fuente real). Sin cuadre en 35 días → DESACTUALIZADO.

import { SelloFuente } from "@/componentes/SelloFuente";
import type { Fecha } from "@/lib/caja/fechas";

export const DIAS_CUADRE_VIGENTE = 35;

export function SelloCaja({
  ultimoCuadre,
  inicio,
  editadoEn,
  ahora,
}: {
  ultimoCuadre: { fecha: Fecha | null; dias: number | null };
  inicio: Fecha;
  editadoEn: string | null;
  ahora: Date;
}) {
  const vencido = ultimoCuadre.dias == null || ultimoCuadre.dias > DIAS_CUADRE_VIGENTE;
  return (
    <div>
      <SelloFuente
        ahora={ahora}
        d={{
          fuente: ultimoCuadre.fecha ? "Tus registros · cuadre con tu banco" : "Tus registros · saldos iniciales",
          url: "/caja",
          fechaDato: ultimoCuadre.fecha ?? inicio,
          verificadoEn: editadoEn,
          desactualizado: vencido,
          ultimaCorridaFallo: false,
        }}
      />
      {vencido ? (
        <p className="sello">
          {ultimoCuadre.fecha
            ? `Último cuadre con tu banco hace ${ultimoCuadre.dias} días: cuadra un saldo real para corregir la posición.`
            : "Nunca has cuadrado con tu banco: los saldos salen de los saldos iniciales y lo registrado."}
        </p>
      ) : null}
    </div>
  );
}
