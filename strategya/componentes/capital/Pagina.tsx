// Armado común de cada página de /capital: lee los datos una vez, resuelve el mes y pinta el marco.
// Si la base no responde, lo dice con el motivo (PanelError) en vez de mostrar cifras vacías.

import { PanelError } from "@/componentes/PanelError";
import { hoyRD } from "@/lib/capital/fechas";
import { mesDeParametro } from "@/lib/capital/formulario";
import { datosCapital, type DatosCapital } from "@/lib/datos-capital";
import { avisoDe, Marco, type Pestana } from "./Marco";

export type ParametrosBusqueda = Record<string, string | string[] | undefined>;

export async function PaginaCapital({
  actual,
  sp,
  vista,
}: {
  actual: Pestana;
  sp: ParametrosBusqueda;
  vista: (datos: DatosCapital, mes: string) => React.ReactNode;
}) {
  const aviso = avisoDe(sp);
  const hoy = hoyRD(new Date());
  let datos: DatosCapital;
  try {
    datos = await datosCapital();
  } catch (e) {
    const mes = mesDeParametro(sp.mes, hoy);
    const mensaje = (e as Error).message;
    return (
      <Marco actual={actual} mes={mes} hoyMes={hoy.slice(0, 7)} aviso={aviso}>
        <PanelError titulo="Portafolio Financiero" mensaje={mensaje} />
        {/schema must be one of|Invalid schema/i.test(mensaje) ? (
          <p className="cap-aviso cap-ancho">
            El Portafolio vive en el esquema <span className="mono">personal</span>: agrégalo también en Exposed schemas.
          </p>
        ) : null}
      </Marco>
    );
  }
  const mes = mesDeParametro(sp.mes, datos.ctx.hoy);
  const meses = Object.keys(datos.ctx.cierres);
  const cerrados = new Set(meses.filter((m) => datos.ctx.cierres[m].cerrado));
  return (
    <Marco actual={actual} mes={mes} hoyMes={datos.ctx.hoy.slice(0, 7)} conCierre={meses} cerrados={cerrados} aviso={aviso} actualizado={datos.actualizado}>
      {vista(datos, mes)}
    </Marco>
  );
}
