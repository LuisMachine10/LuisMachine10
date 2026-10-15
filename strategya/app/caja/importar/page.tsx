import type { Metadata } from "next";
import { ImportarCaja } from "@/componentes/caja/ImportarCaja";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";

export const metadata: Metadata = { title: "Importar · Caja · Strategya" };
export const dynamic = "force-dynamic";

export default async function PaginaImportar() {
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="importar" editadoEn={null}>
        <PanelError titulo="Importar caja" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  const hayDatos = !!datos.config || datos.cuentas.length > 0 || datos.movimientos.length > 0;
  return (
    <MarcoCaja actual="importar" editadoEn={editadoEn}>
      <section className="panel panel-ancho" aria-labelledby="t-importar">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-importar">
            Importar del artefacto
          </h2>
        </div>
        <div className="panel-cuerpo">
          <p className="chico">
            Sube el JSON del artefacto «Calendario de Caja» (config, cuentas, categorías, recurrentes y días). Primero se revisa y
            se muestra un resumen; nada se escribe hasta que confirmes. Al confirmar se reemplaza todo en una sola transacción: si
            algo falla, no cambia nada. Los ids del artefacto se conservan.
          </p>
          {hayDatos ? (
            <p className="chico baja">
              Ya hay datos de caja ({datos.cuentas.length} cuentas, {datos.movimientos.length} movimientos). Importar los reemplaza.
            </p>
          ) : null}
          <ImportarCaja hayDatos={hayDatos} />
        </div>
      </section>
    </MarcoCaja>
  );
}
