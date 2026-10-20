import Big from "big.js";
import type { Metadata } from "next";
import Link from "next/link";
import { Ayuda, Icono } from "@/componentes/caja/Iconos";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { SinDatosCaja } from "@/componentes/caja/SinDatosCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { esMes, hoyRD, mesDe, nombreMes } from "@/lib/caja/fechas";
import { rd } from "@/lib/caja/formato";
import { type FilaPresupuesto, horizonte, presupuestoDelMes, simular } from "@/lib/caja/motor";
import { NOMBRE_GRUPO } from "@/lib/caja/tipos";

export const metadata: Metadata = { title: "Presupuesto · Caja · Strategya" };
export const dynamic = "force-dynamic";

const TITULO = "Presupuesto";
const SUB = "Aquí ves cuánto llevas gastado de cada cosa este mes y cuánto te queda.";

/** Ancho en % para dibujar la barra (solo para el dibujo; las cifras se muestran exactas). */
function pct(parte: string, total: string): number {
  const t = new Big(total);
  if (t.lte(0)) return 0;
  return Math.min(100, Math.max(0, Number(new Big(parte).div(t).times(100).toFixed(1))));
}

function Fila({ f, verbo }: { f: FilaPresupuesto; verbo: string }) {
  const usado = new Big(f.real).plus(f.viene);
  if (!f.presupuesto) {
    return (
      <li className="caja-pres-fila sin">
        <div className="caja-pres-linea">
          <span className="caja-pres-nombre">{f.categoria.nombre}</span>
          <span className="mono">{rd(usado.toString())}</span>
        </div>
        <div className="caja-barra sin-dato" role="img" aria-label="Sin presupuesto: no hay barra que llenar" />
        <p className="caja-pres-nota">
          {verbo === "gastado" ? "Sin límite" : "Esperado sin meta"} · {verbo} {rd(f.real)}
          {new Big(f.viene).gt(0) ? ` y vienen ${rd(f.viene)}` : ""}.{" "}
          {verbo === "gastado" ? <Link href="/caja/ajustes#t-categorias">Ponerle un límite</Link> : null}
        </p>
      </li>
    );
  }
  const pasado = f.queda != null && new Big(f.queda).lt(0);
  const cerca = !pasado && (f.usado ?? 0) >= 85;
  const ancho = Math.max(pct(usado.toString(), f.presupuesto), 0);
  const anchoReal = pct(f.real, f.presupuesto);
  return (
    <li className={`caja-pres-fila ${pasado ? "pasado" : cerca ? "cerca" : ""}`}>
      <div className="caja-pres-linea">
        <span className="caja-pres-nombre">{f.categoria.nombre}</span>
        <span className="mono">
          {rd(usado.toString())} <span className="tenue">de {rd(f.presupuesto)}</span>
        </span>
      </div>
      <div
        className={`caja-barra ${pasado ? "pasado" : cerca ? "cerca" : ""}`}
        role="img"
        aria-label={`${f.usado ?? 0}% del presupuesto: ${verbo} ${rd(f.real)}, vienen ${rd(f.viene)}, presupuesto ${rd(f.presupuesto)}`}
      >
        <span className="real" style={{ width: `${anchoReal}%` }} />
        <span className="viene" style={{ left: `${anchoReal}%`, width: `${Math.max(0, ancho - anchoReal)}%` }} />
      </div>
      <p className="caja-pres-nota">
        {pasado ? (
          <span className="baja">Te pasas por {rd(new Big(f.queda!).abs().toString())}</span>
        ) : (
          <span className={cerca ? "alerta" : ""}>Te quedan {rd(f.queda!)}</span>
        )}
        <span className="tenue">
          {" "}
          · {f.usado ?? 0}%{new Big(f.viene).gt(0) ? ` · incluye ${rd(f.viene)} programado` : ""}
        </span>
      </p>
    </li>
  );
}

export default async function PaginaPresupuesto({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const hoy = hoyRD();
  const q = await searchParams;
  const mes = esMes(q.mes) ? q.mes : mesDe(hoy);
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="presupuesto" editadoEn={null} titulo={TITULO} sub={SUB}>
        <PanelError titulo="Presupuesto" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  if (!datos.config) {
    return (
      <MarcoCaja actual="presupuesto" editadoEn={editadoEn} titulo={TITULO} sub={SUB}>
        <SinDatosCaja que="presupuesto" />
      </MarcoCaja>
    );
  }
  const sim = simular(datos, { hoy, hasta: horizonte(mes, hoy) });
  const grupos = presupuestoDelMes(datos, sim, mes);

  return (
    <MarcoCaja actual="presupuesto" mes={mes} editadoEn={editadoEn} titulo={TITULO} sub={SUB}>
      <div className="panel-ancho caja-pres-cabeza">
        <NavMes mes={mes} ruta="/caja/presupuesto" hoyMes={mesDe(hoy)} />
        <div className="chico tenue caja-pres-ayuda">
          La barra oscura es lo que ya anotaste en {nombreMes(mes)}; la clara, lo programado de hoy al fin de mes. Montos en RD$.
          <Ayuda que="cómo se calcula">
            Te queda = tu límite del mes − lo anotado − lo programado que falta. Verde va bien, ámbar pasó del 85 %, rojo ya se pasó.
          </Ayuda>
        </div>
      </div>
      {grupos.length === 0 ? (
        <section className="panel panel-ancho caja-vacia">
          <span className="caja-bienvenida-icono" aria-hidden="true">
            <Icono n="balanza" tam={24} />
          </span>
          <h2 className="panel-titulo">Aún no tienes categorías</h2>
          <p className="tenue">Crea categorías como «Comida» o «Gasolina» y ponles un límite al mes para ver cuánto te queda.</p>
          <Link href="/caja/ajustes#t-categorias" className="boton caja-boton-grande">
            Crear una categoría
          </Link>
        </section>
      ) : null}
      {grupos.map((g) => {
        const verbo = g.grupo === "ingreso" ? "recibido" : "gastado";
        const hayPres = new Big(g.presupuesto).gt(0);
        return (
          <section key={g.grupo} className="panel caja-pres-grupo" aria-labelledby={`t-g-${g.grupo}`}>
            <div className="panel-cabecera">
              <h2 className="panel-titulo" id={`t-g-${g.grupo}`}>
                {NOMBRE_GRUPO[g.grupo]}
              </h2>
              <span className="mono chico tenue caja-pres-total">
                {rd(new Big(g.real).plus(g.viene).toString())}
                {hayPres ? ` de ${rd(g.presupuesto)}` : ""}
              </span>
            </div>
            <div className="panel-cuerpo">
              <ul className="caja-pres-lista">
                {g.filas.map((f) => (
                  <Fila key={f.categoria.id} f={f} verbo={verbo} />
                ))}
              </ul>
              {hayPres ? (
                <p className={`caja-pres-pie ${new Big(g.queda).lt(0) ? "baja" : ""}`}>
                  {new Big(g.queda).lt(0) ? `En total te pasas por ${rd(new Big(g.queda).abs().toString())}` : `En total te quedan ${rd(g.queda)}`}
                  <span className="tenue chico"> (solo de lo que tiene límite)</span>
                </p>
              ) : null}
            </div>
          </section>
        );
      })}
    </MarcoCaja>
  );
}
