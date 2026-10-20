// Sello de las cifras de la caja: la fuente son los registros de Mena; la fecha del dato es el último
// cuadre con el banco (o, si nunca se cuadró, los saldos de inicio que Mena escribió). Si esa
// referencia tiene más de 35 días → DESACTUALIZADO.

import { SelloFuente } from "@/componentes/SelloFuente";
import { diasEntre, type Fecha, hoyRD } from "@/lib/caja/fechas";

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
  // Sin cuadre, la referencia son los saldos iniciales que Mena escribió en la fecha de inicio.
  const dias = ultimoCuadre.dias ?? Math.max(0, diasEntre(inicio, hoyRD(ahora)));
  const vencido = dias > DIAS_CUADRE_VIGENTE;
  return (
    <div className="caja-sello">
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
        <p className="sello caja-sello-nota">
          {ultimoCuadre.fecha
            ? `Último cuadre con tu banco hace ${ultimoCuadre.dias} días. Toca un día y usa «Cuadrar con tu banco» para corregirlo.`
            : `Tus saldos de inicio tienen ${dias} días y nunca los has comparado con tu banco. Toca un día y usa «Cuadrar con tu banco».`}
        </p>
      ) : null}
    </div>
  );
}
