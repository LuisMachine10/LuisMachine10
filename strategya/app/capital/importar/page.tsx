import type { Metadata } from "next";
import Link from "next/link";
import { Importador } from "@/componentes/capital/Importador";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { Panel } from "@/componentes/capital/Piezas";

export const metadata: Metadata = { title: "Importar · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalImportar({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return (
    <PaginaCapital
      actual="importar"
      sp={sp}
      vista={(datos) => (
        <>
          <Panel titulo="Importar tus datos" id="cap-t-importar" ancho extra={<span className="tenue chico">opcional · para traer tu artefacto</span>}>
            <p className="cap-nota" style={{ marginTop: 0 }}>
              Sube el archivo JSON de tu artefacto «Mena Capital». Se valida todo y verás un resumen: nada cambia hasta que confirmes. Las clases
              anteriores (por ejemplo «Acciones EE. UU.») se traducen solas a las 4 de hoy: Efectivo, Cuentas de Ahorro, Renta Fija y Renta Variable.
            </p>
            <p className="tenue chico" style={{ margin: "8px 0 0" }}>
              Guardado ahora: {datos.ctx.activos.length} instrumentos · {datos.ctx.tx.length} transacciones · {Object.keys(datos.ctx.cierres).length} cierres ·
              parámetros {datos.configurado ? "sí" : "no"} · política {datos.ips ? "sí" : "no"} ·{" "}
              <a href="/capital/exportar" download>descargar una copia antes de importar</a>
            </p>
            <details className="cap-mas">
              <summary>Formato y qué reemplaza</summary>
              <p className="cap-nota">
                La forma es <span className="mono">{`{ "parametros", "activos", "transacciones", "cierres", "ips" }`}</span> y cualquier clave puede faltar.
                Tipos, fechas y números se validan y se guardan como texto decimal exacto. Al confirmar, cada sección presente reemplaza a la guardada en una
                sola transacción; las ausentes no se tocan. Para cargar un instrumento a mano usa «Agregar instrumento» en{" "}
                <Link href="/capital/cartera">Cartera</Link>.
              </p>
            </details>
            <div style={{ marginTop: 16 }}>
              <Importador />
            </div>
          </Panel>
        </>
      )}
    />
  );
}
