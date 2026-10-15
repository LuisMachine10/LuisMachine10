import type { Metadata } from "next";
import Link from "next/link";
import { Importador } from "@/componentes/capital/Importador";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { Panel } from "@/componentes/capital/Piezas";

export const metadata: Metadata = { title: "Importar · Mena Capital" };
export const dynamic = "force-dynamic";

export default async function CapitalImportar({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return (
    <PaginaCapital
      actual="importar"
      sp={sp}
      vista={(datos) => (
        <>
          <Panel titulo="Importar tus datos" id="cap-t-importar" ancho>
            <p className="cap-nota" style={{ marginTop: 0 }}>
              Sube el archivo JSON de tu artefacto «Mena Capital» con la forma{" "}
              <span className="mono">{`{ "parametros", "activos", "transacciones", "cierres", "ips" }`}</span> (cualquier clave puede faltar). Se
              valida todo antes de guardar: tipos, fechas y números, que se guardan como texto decimal exacto. Verás un resumen y nada cambia hasta
              que confirmes. Al confirmar, cada sección presente reemplaza a la guardada en una sola transacción; las ausentes no se tocan.
            </p>
            <p className="cap-nota">
              Ahora mismo hay guardados: {datos.ctx.activos.length} instrumentos · {datos.ctx.tx.length} transacciones ·{" "}
              {Object.keys(datos.ctx.cierres).length} cierres · parámetros {datos.configurado ? "sí" : "no"} · política {datos.ips ? "sí" : "no"}.{" "}
              <Link href="/capital/exportar">Descargar una copia antes de importar</Link>.
            </p>
            <div style={{ marginTop: 12 }}>
              <Importador />
            </div>
          </Panel>
        </>
      )}
    />
  );
}
