// Secciones de Mena Capital para la terminal principal (Server Components async: leen sus propios datos).
//   <ResumenCapital />   patrimonio, cambio del mes, líquidos y fondo de emergencia en meses
//   <HallazgosCapital /> lo que está fuera de meta este mes
// Si la base no responde o Mena no ha importado nada, lo dicen en vez de mostrar ceros.

import Link from "next/link";
import "@/estilos/capital.css";
import { hallazgos, ordenar } from "@/lib/capital/alertas";
import { cambioDelMes, fotoHasta, indicadores } from "@/lib/capital/cierres";
import { n } from "@/lib/capital/decimal";
import { mesCorto, mesLargo } from "@/lib/capital/fechas";
import { num, pctSg, rd, tono } from "@/lib/capital/formato";
import { datosCapital, type DatosCapital } from "@/lib/datos-capital";
import { ConSigno, Kpi, ListaHallazgos, SinDatos } from "./Piezas";
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
        <span className="etiqueta error">✕ sin conexión a los datos</span>
      </div>
      <div className="vacio">
        <p className="baja chico">{mensaje}</p>
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
  if ("error" in r) return <PanelFalla titulo="Mena Capital" mensaje={r.error} />;
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
          <Link href="/capital">Mena Capital</Link>
        </h2>
        <SelloRegistros foto={ind.foto} mesCierre={mesFoto ? mesLargo(mesFoto) : null} />
      </div>
      {!datos.configurado && !ctx.activos.length ? (
        <SinDatos>
          Sin datos todavía. Importa tu archivo de Mena Capital en <Link href="/capital/importar">Capital → Importar</Link>.
        </SinDatos>
      ) : (
        <>
          <div className="cap-kpis">
            <Kpi rotulo="Patrimonio neto" valor={rd(ind.foto.patrimonio)} meta={mesLargo(mes)} tono="neutra" />
            <div className="cap-kpi neutra">
              <div className="cap-rotulo">Cambio del mes</div>
              <div className="k">{cambio ? <ConSigno v={cambio.cambio} /> : "—"}</div>
              <div className="m">{cambio ? `${pctSg(cambio.pct, 1)} vs ${mesCorto(cambio.previo)}` : "sin mes previo cerrado"}</div>
            </div>
            <Kpi rotulo="Líquidos" valor={rd(ind.foto.liquidos)} meta="efectivo + ahorros" tono="neutra" />
            <Kpi
              rotulo="Fondo de emergencia"
              valor={ind.fondoMeses ? `${num(ind.fondoMeses, 1)} meses` : "—"}
              meta={ind.fondoMeses ? `meta ≥ ${num(metaFondo, 0)}` : "sin gasto registrado"}
              tono={ind.fondoMeses && metaFondo.gt(0) ? tono(ind.fondoMeses, metaFondo, 3) : "neutra"}
            />
          </div>
          <div className="panel-cuerpo">
            <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={datos.ahora} hoy={ctx.hoy} />
          </div>
        </>
      )}
    </section>
  );
}

export async function HallazgosCapital({ maximo = 5 }: { maximo?: number }) {
  const r = await cargar();
  if ("error" in r) return <PanelFalla titulo="Mena Capital · hallazgos" mensaje={r.error} />;
  const { ctx } = r.datos;
  const mes = ctx.hoy.slice(0, 7);
  const lista = ordenar(hallazgos(ctx, mes));
  const visibles = lista.slice(0, maximo);
  return (
    <section className="panel" aria-labelledby="cap-term-hallazgos">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="cap-term-hallazgos">
          Mena Capital · hallazgos
        </h2>
        <span className="sello">
          {mesLargo(mes)} · {lista.filter((h) => h.n !== "ok").length} fuera de meta
        </span>
      </div>
      <ListaHallazgos lista={visibles} />
      {lista.length > visibles.length ? (
        <p className="cap-nota" style={{ padding: "0 12px 10px" }}>
          <Link href="/capital">Ver los {lista.length} hallazgos</Link>
        </p>
      ) : null}
    </section>
  );
}
