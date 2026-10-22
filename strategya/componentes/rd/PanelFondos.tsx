// Fondos de Inversión en el Mercado de Valores de RD: rendimiento a 30 días y a 1 año (base 360 o 365),
// valor cuota cuando la SAFI lo publica, fecha de corte y fuente. Filtros en el cliente (TablaFondos).

import "@/estilos/rd.css";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { fondosVista, SAFIS_A_MANO } from "@/lib/rd";
import { Cabecera, ICONOS_RD, QueEs, SinDatos } from "./comun";
import { TablaFondos, type FondoFila } from "./TablaFondos";

export async function PanelFondos() {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Fondos de Inversión en el Mercado de Valores de RD" mensaje={(e as Error).message} />;
  }
  return <VistaPanelFondos d={d} ahora={ahora} />;
}

function listaNatural(xs: readonly string[]): string {
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : (xs[0] ?? "");
}

export function VistaPanelFondos({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const nombreFuente = new Map(d.fuentes.map((f) => [f.id, f.nombre]));
  const fondos: FondoFila[] = fondosVista(d.fondos, ahora).map((f) => ({
    ...f,
    fuente: f.manual ? "Carga manual" : (nombreFuente.get(f.fuenteId ?? "") ?? f.safi),
  }));

  return (
    <section className="panel panel-ancho rd-panel" aria-labelledby="t-fondos">
      <Cabecera
        id="t-fondos"
        titulo="Fondos de Inversión en el Mercado de Valores de RD"
        icono={ICONOS_RD.fondos}
        para="Compara cuánto rindieron los fondos abiertos en los últimos 30 días y en el último año. Filtra por administradora y moneda."
        ayuda={
          <QueEs titulo="Rendimiento, SAFI y valor cuota">
            El rendimiento es lo que ganó el fondo en ese periodo, llevado a tasa anual. La SAFI (o AFI) es la empresa que lo
            administra. El valor cuota es el precio de una parte del fondo ese día. Lo pasado no garantiza lo futuro.
          </QueEs>
        }
      />
      <div className="panel-cuerpo">
        {fondos.length === 0 ? (
          <SinDatos accion={{ href: "/carga#t-carga-fondo", texto: "Agregar un fondo" }}>
            Todavía no hay fondos. Se leen solos los de Excel y AFI Reservas (dos veces al día); los demás se agregan a mano con
            el enlace de la SAFI.
          </SinDatos>
        ) : (
          <TablaFondos fondos={fondos} />
        )}
        <p className="rd-nota rd-nota-pie">
          {listaNatural(SAFIS_A_MANO)} aún no se leen solas: se agregan a mano en{" "}
          <Link href="/carga#t-carga-fondo">Agregar un dato</Link>.
        </p>
      </div>
    </section>
  );
}
