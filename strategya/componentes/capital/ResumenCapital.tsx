// Secciones de Mena Capital para la terminal principal (Server Components async: leen sus propios datos).
//   <ResumenCapital />   patrimonio, cambio del mes, líquidos y fondo de emergencia en meses
//   <HallazgosCapital /> lo que está fuera de meta este mes
// Si la base no responde o Mena no ha importado nada, lo dicen en vez de mostrar ceros.

import Link from "next/link";
import "@/estilos/capital.css";
import { cambioDelMes, fotoHasta, indicadores } from "@/lib/capital/cierres";
import { n } from "@/lib/capital/decimal";
import { mesCorto, mesLargo } from "@/lib/capital/fechas";
import { num, rd, tono } from "@/lib/capital/formato";
import { datosCapital, type DatosCapital } from "@/lib/datos-capital";
import { MatrizRiesgo } from "./Matriz";
import { ConSigno, Estado, Kpi, Pastilla, SinDatos } from "./Piezas";
import { SelloFx, SelloRegistros } from "./Sellos";

async function cargar(): Promise<{ datos: DatosCapital } | { error: string }> {
  try {
    return { datos: await datosCapital() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function PanelFalla({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <section className="panel" role="alert" aria-labelledby="cap-term-error">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="cap-term-error">
          {titulo}
        </h2>
        <Estado tono="error">sin conexión a los datos</Estado>
      </div>
      <div className="panel-cuerpo">
        <p className="chico" style={{ margin: 0, color: "var(--texto-2)" }}>
          {mensaje}
        </p>
        {/schema must be one of|Invalid schema/i.test(mensaje) ? (
          <p className="chico">
            Falta exponer el esquema <span className="mono">personal</span> en Supabase → Project Settings → Data API → Exposed schemas.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export async function ResumenCapital() {
  const r = await cargar();
  if ("error" in r) return <PanelFalla titulo="Portafolio Financiero" mensaje={r.error} />;
  const { datos } = r;
  const { ctx } = datos;
  const mes = ctx.hoy.slice(0, 7);
  const ind = indicadores(ctx, mes);
  const cambio = cambioDelMes(ctx, mes);
  const metaFondo = n(ctx.p.metaFondo);
  const mesFoto = ind.foto.vivo ? null : (fotoHasta(ctx, mes)?.mes ?? null);
  return (
    <section className="panel cap-resumen-terminal" aria-labelledby="cap-term-resumen">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="cap-term-resumen">
          <Link href="/capital">Portafolio Financiero</Link>
        </h2>
        <SelloRegistros foto={ind.foto} mesCierre={mesFoto ? mesLargo(mesFoto) : null} />
      </div>
      {!datos.configurado && !ctx.activos.length ? (
        <div className="panel-cuerpo">
          <SinDatos accion={{ href: "/capital/cartera", texto: "Agregar instrumentos" }}>Sin datos todavía: agrega tus instrumentos o importa tu archivo en Capital.</SinDatos>
        </div>
      ) : (
        <div className="panel-cuerpo" style={{ display: "grid", gap: 12 }}>
          <div className="cap-heroe">
            <div className="rotulo">Patrimonio neto · {mesLargo(mes)}</div>
            <div className="valor" style={{ fontSize: 28 }}>
              <small>RD$</small>
              {num(ind.foto.patrimonio)}
            </div>
            <div className="sub">
              {cambio ? (
                <>
                  <Pastilla v={cambio.pct} />
                  <ConSigno v={cambio.cambio} />
                  <span>vs {mesCorto(cambio.previo)}</span>
                </>
              ) : (
                <span>Sin mes previo cerrado para comparar</span>
              )}
            </div>
          </div>
          <div className="cap-mosaicos">
            <Kpi rotulo="Líquidos" valor={rd(ind.foto.liquidos)} meta="efectivo + cuentas de ahorro" tono="neutra" />
            <Kpi
              rotulo="Fondo de emergencia"
              valor={ind.fondoMeses ? num(ind.fondoMeses, 1) : "—"}
              unidad={ind.fondoMeses ? "meses" : undefined}
              meta={ind.fondoMeses ? `meta ≥ ${num(metaFondo, 0)}` : "sin gasto registrado"}
              tono={ind.fondoMeses && metaFondo.gt(0) ? tono(ind.fondoMeses, metaFondo, 3) : "neutra"}
            />
          </div>
          <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={datos.ahora} hoy={ctx.hoy} />
        </div>
      )}
    </section>
  );
}

export async function HallazgosCapital(_: { maximo?: number } = {}) {
  const r = await cargar();
  if ("error" in r) return <PanelFalla titulo="Portafolio · riesgos" mensaje={r.error} />;
  const { ctx } = r.datos;
  const mes = ctx.hoy.slice(0, 7);
  return (
    <section className="panel" aria-labelledby="cap-term-hallazgos">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="cap-term-hallazgos">
          Portafolio · riesgos
        </h2>
        <Link href="/capital/analisis" className="chico">
          Ver cada riesgo →
        </Link>
      </div>
      <div className="panel-cuerpo">
        <MatrizRiesgo ctx={ctx} detalle={false} mes={mes} />
      </div>
    </section>
  );
}
