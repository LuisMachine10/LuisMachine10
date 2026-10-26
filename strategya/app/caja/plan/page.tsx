import type { Metadata } from "next";
import { BotonesNuevo } from "@/componentes/caja/BotonesNuevo";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { VistaPlanDelMes } from "@/componentes/caja/PlanDelMes";
import { SinDatosCaja } from "@/componentes/caja/SinDatosCaja";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { leerCaja } from "@/lib/caja/datos";
import { esMes, hoyRD, mesDe, ultimoDia } from "@/lib/caja/fechas";
import { horizonte, simular } from "@/lib/caja/motor";
import { catalogos } from "@/lib/caja/vista";
import { leerRegistro } from "@/lib/capital/datos-registro";
import { planTarjetas } from "@/lib/finanzas/credito";
import { planDelMes } from "@/lib/finanzas/plan";

export const metadata: Metadata = { title: "Plan del mes · Presupuesto · Strategya" };
export const dynamic = "force-dynamic";

const SUB = "Aquí planeas tu mes en montos: primero lo que ahorras (cada línea con su instrumento), luego la tarjeta, y ves lo que te sobra.";

export default async function PaginaPlan({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ahora = new Date();
  const hoy = hoyRD(ahora);
  const q = await searchParams;
  const mes = esMes(q.mes) ? q.mes : mesDe(hoy);
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="plan" editadoEn={null} sub={SUB}>
        <PanelError titulo="Plan del mes" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn, enlaces } = lectura;
  if (!datos.config) {
    return (
      <MarcoCaja actual="plan" editadoEn={editadoEn} sub={SUB}>
        <SinDatosCaja que="resultados" />
      </MarcoCaja>
    );
  }
  const registro = await leerRegistro(datos, enlaces, hoy).catch(() => []);
  const hasta = horizonte(mes, hoy);
  const sim = simular(datos, { hoy, hasta: hasta > ultimoDia(mes) ? hasta : ultimoDia(mes) });
  const plan = planDelMes(datos, mes, hoy, enlaces, sim);
  const tarjetas = planTarjetas(sim, datos.cuentas, hoy);
  const { cuentas, categorias } = catalogos(datos, registro);
  const nombres = Object.fromEntries(cuentas.map((c) => [c.id, c.nombre]));
  return (
    <MarcoCaja actual="plan" mes={mes} editadoEn={editadoEn} sub={SUB} acciones={<BotonesNuevo />}>
      <div className="panel-ancho caja-er-cabeza">
        <NavMes mes={mes} ruta="/caja/plan" hoyMes={mesDe(hoy)} />
        <SelloFuente
          ahora={ahora}
          d={{ fuente: "Tus registros · fijos, líneas de ahorro y movimientos", url: null, fechaDato: hoy, verificadoEn: editadoEn, desactualizado: false, ultimaCorridaFallo: false }}
        />
      </div>
      <VistaPlanDelMes plan={plan} tarjetas={tarjetas} datos={datos} cuentas={cuentas} categorias={categorias} hoy={hoy} nombres={nombres} />
    </MarcoCaja>
  );
}
