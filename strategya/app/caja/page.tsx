import type { Metadata } from "next";
import { AsistenteCaja } from "@/componentes/caja/AsistenteCaja";
import { BotonesNuevo } from "@/componentes/caja/BotonesNuevo";
import { CalendarioCaja } from "@/componentes/caja/CalendarioCaja";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { SelloCaja } from "@/componentes/caja/SelloCaja";
import { TilesResumen } from "@/componentes/caja/TilesResumen";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { leerRegistro } from "@/lib/capital/datos-registro";
import { cuentasParaPresupuesto } from "@/lib/capital/registro";
import { esFecha, esMes, hoyRD, mesDe, nombreMes, primerDia } from "@/lib/caja/fechas";
import { horizonte, resumir, simular } from "@/lib/caja/motor";
import { armarVistaMes, avisosTarjetas, catalogos, ultimoCuadre } from "@/lib/caja/vista";

export const metadata: Metadata = { title: "Presupuesto · Strategya" };
export const dynamic = "force-dynamic";


export default async function PaginaCaja({ searchParams }: { searchParams: Promise<{ mes?: string; dia?: string }> }) {
  const ahora = new Date();
  const hoy = hoyRD(ahora);
  const q = await searchParams;
  const dia = esFecha(q.dia) ? q.dia : null;
  const mes = esMes(q.mes) ? q.mes : dia ? mesDe(dia) : mesDe(hoy);

  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="calendario" editadoEn={null}>
        <PanelError titulo="Presupuesto" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  if (!datos.config) {
    // Paso 3 del asistente: se eligen las cuentas del registro único del Portafolio (no se anotan dos veces).
    const registro = await leerRegistro(datos, lectura.enlaces, hoy).then(cuentasParaPresupuesto, () => []);
    return (
      <MarcoCaja actual="calendario" editadoEn={editadoEn} sinPestanas>
        <AsistenteCaja registro={registro} />
      </MarcoCaja>
    );
  }

  const sim = simular(datos, { hoy, hasta: horizonte(mes, hoy) });
  const resumen = resumir(sim, datos.config);
  const vista = armarVistaMes(datos, sim, mes);
  const diaInicial = dia && mesDe(dia) === mes ? dia : mesDe(hoy) === mes ? hoy : primerDia(mes);
  // Las inversiones que no viven en el Presupuesto (acciones, fondos por cuotas) también son destino de ahorro.
  const registro = await leerRegistro(datos, lectura.enlaces, hoy).catch(() => []);
  const { cuentas, categorias } = catalogos(datos, registro);
  const avisos = [...avisosTarjetas(datos, hoy), ...sim.advertencias];

  return (
    <MarcoCaja actual="calendario" mes={mes} editadoEn={editadoEn} acciones={<BotonesNuevo />}>
      <section className="panel panel-ancho caja-resumen" aria-labelledby="t-resumen">
        <h2 className="sr-solo" id="t-resumen">
          Tu caja hoy
        </h2>
        <TilesResumen r={resumen} colchon={datos.config.colchon} />
        <SelloCaja ultimoCuadre={ultimoCuadre(datos, hoy)} inicio={datos.config.inicio} editadoEn={editadoEn} ahora={ahora} />
        {avisos.length ? (
          <ul className="caja-avisos">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <CalendarioCaja
        key={mes}
        vista={vista}
        diaInicial={diaInicial}
        titulo={nombreMes(mes)}
        cuentas={cuentas}
        categorias={categorias}
        nav={<NavMes mes={mes} ruta="/caja" hoyMes={mesDe(hoy)} />}
      />
    </MarcoCaja>
  );
}
