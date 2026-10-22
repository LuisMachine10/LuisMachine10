import type { Metadata } from "next";
import Link from "next/link";
import "@/estilos/dashboard.css";
import { Actualizador } from "@/componentes/Actualizador";
import { IntroPantalla } from "@/componentes/IntroPantalla";
import { BannerAlertas } from "@/componentes/alertas/BannerAlertas";
import { ResumenCaja } from "@/componentes/caja/ResumenCaja";
import { HallazgosCapital, ResumenCapital } from "@/componentes/capital/ResumenCapital";
import { PanelGlobo } from "@/componentes/globo/PanelGlobo";
import { CurvaTesoro } from "@/componentes/CurvaTesoro";
import { Encabezado } from "@/componentes/Encabezado";
import { GuerrasEnElMundo } from "@/componentes/ia/GuerrasEnElMundo";
import { LasCincoDelDia } from "@/componentes/ia/LasCincoDelDia";
import { CintaPrecios, PanelAcciones, PanelEnergia, PanelIndices, PanelMetales, PanelTasasDivisas } from "@/componentes/mercado";
import {
  Glosario,
  Mapa,
  PanelAgenda,
  PanelFusionesIPO,
  PanelInstituciones,
  PanelNoticias,
  PanelQueVigilar,
} from "@/componentes/noticias";
import { PanelError } from "@/componentes/PanelError";
import { BloqueHoy, fechaLargaRD } from "@/componentes/terminal/BloqueHoy";
import { ResumenDia } from "@/componentes/terminal/ResumenDia";
import { Seccion } from "@/componentes/terminal/Seccion";
import { Bienvenida } from "@/componentes/ayuda/Bienvenida";
import { BoletinTasas, PanelCombustibles, PanelEmisiones, PanelRD } from "@/componentes/rd";
import { armarCurva } from "@/lib/curva";
import { datosTesoro, estadoTareas } from "@/lib/datos";
import { fechaCorta, fechaHoraRD } from "@/lib/formato";
import { frescura } from "@/lib/frescura";

export const metadata: Metadata = { title: "News · Strategya" };
export const dynamic = "force-dynamic";

// News: cómo amaneció el día en una sola página (antes «Hoy», en /). El Dashboard (/) es la portada
// que Mena arma a su gusto con widgets.

/** Curva del Tesoro (sección 10, junto a Tasas y divisas). Maneja su propio error. */
async function SeccionTesoro({ ahora }: { ahora: Date }) {
  try {
    const { series, observaciones, fuente, tarea } = await datosTesoro();
    const curva = armarCurva(series, observaciones);
    return <CurvaTesoro curva={curva} tarea={tarea} fuente={fuente} ahora={ahora} />;
  } catch (e) {
    return <PanelError titulo="Curva del Tesoro de EE. UU." mensaje={(e as Error).message} />;
  }
}

/** Pie (sección 17): fuentes en uso y todo lo que hoy no está confirmado. */
async function Pie({ ahora, estado }: { ahora: Date; estado: Awaited<ReturnType<typeof estadoTareas>> | null }) {
  const noConfirmado: string[] = [];
  if (!estado) noConfirmado.push("No se pudo leer el estado de las lecturas automáticas.");
  else {
    for (const t of estado.tareas) {
      if (t.estado === "error") noConfirmado.push(`${t.tarea}: la última lectura falló (${t.error ?? "sin detalle"}).`);
      else if (t.estado === "parcial") noConfirmado.push(`${t.tarea}: lectura parcial${t.error ? ` (${t.error})` : ""}.`);
    }
  }
  try {
    const { series, observaciones } = await datosTesoro();
    const curva = armarCurva(series, observaciones);
    if (!curva) noConfirmado.push("Curva del Tesoro: sin datos todavía.");
    else if (frescura({ fecha_dato: curva.fecha }, curva.maxAntiguedadMin, ahora).desactualizado)
      noConfirmado.push(`Curva del Tesoro: el último dato es del ${fechaCorta(curva.fecha)} (desactualizado).`);
  } catch {
    // El panel de la curva ya muestra el error.
  }
  const fuentes = (estado?.fuentes ?? []).filter((f) => f.lectura_automatica && f.url);
  return (
    <footer className="pie ter-pie">
      <div className="ter-pie-bloque">
        <h2>Fuentes</h2>
        {fuentes.length ? (
          <ul className="ter-pie-fuentes">
            {fuentes.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  {f.nombre}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Sin fuentes registradas todavía.</p>
        )}
      </div>
      <div className="ter-pie-bloque">
        {noConfirmado.length ? (
          <details className="ter-pie-noconf">
            <summary>
              <h2>No confirmado</h2> <span className="etiqueta alerta">{noConfirmado.length}</span>
            </summary>
            <ul>
              {noConfirmado.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        ) : (
          <>
            <h2>No confirmado</h2>
            <p>
              Todas las lecturas automáticas terminaron bien. Cada cifra se marca «dato viejo» si pasa de su antigüedad
              máxima.
            </p>
          </>
        )}
      </div>
      <p>
        Strategya no es asesoría de inversión. Cifras de fuentes oficiales; ninguna sale de un modelo de lenguaje.
        Página generada {fechaHoraRD(ahora.toISOString())} (hora RD). Gráficos con{" "}
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
          TradingView Lightweight Charts
        </a>
        .
      </p>
    </footer>
  );
}

export default async function News() {
  const ahora = new Date();
  const estado = await estadoTareas().catch(() => null);
  const ultima =
    estado?.tareas
      .map((t) => t.ultima_ok)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;

  return (
    <>
      {/* 1 */}
      <Encabezado actual="news" ultimaActualizacion={ultima} />
      <main className="terminal ter">
        <IntroPantalla clave="news">
          <nav className="news-atajos" aria-label="Ir a una parte de News">
            <a href="#hoy">Hoy</a>
            <a href="#mercados">Mercados</a>
            <a href="#rd">RD</a>
            <a href="#mundo">Mundo</a>
            <a href="#dinero">Tu dinero</a>
            <Link href="/noticias" className="news-todos">
              Todos los titulares <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </IntroPantalla>
        {/* 2 */}
        <CintaPrecios />
        <BannerAlertas />

        <Seccion id="hoy" titulo="Hoy" detalle={fechaLargaRD(ahora)} para="Las 6 cifras que más mueven tu dinero. Verde sube, rojo baja; debajo de cada una, en pequeño, de dónde sale y de qué día es.">
          <ResumenDia />
          <BloqueHoy />
          <LasCincoDelDia />
          <PanelQueVigilar ahora={ahora} />
        </Seccion>

        {/* 5–10 */}
        <Seccion id="mercados" titulo="Mercados" para="Bolsas, tasas, monedas, metales y energía. Si algo se mueve fuerte, verás el porqué.">
          <PanelIndices />
          <PanelTasasDivisas />
          <PanelMetales />
          <PanelEnergia />
          <SeccionTesoro ahora={ahora} />
          <PanelAcciones />
          <PanelFusionesIPO ahora={ahora} />
        </Seccion>

        {/* 11–13 */}
        <Seccion id="rd" titulo="República Dominicana" para="Dólar del Banco Central, combustibles, tasas de los bancos y bonos del Gobierno.">
          <PanelRD />
          <PanelCombustibles />
          <BoletinTasas />
          <PanelEmisiones />
        </Seccion>

        {/* 3–4, 14–16 */}
        <Seccion id="mundo" titulo="Mundo y noticias" para="Qué pasa en el mundo y dónde, con titulares de medios reconocidos.">
          <Mapa ahora={ahora} />
          <PanelGlobo />
          <GuerrasEnElMundo />
          <PanelNoticias ahora={ahora} />
          <PanelInstituciones ahora={ahora} />
          <PanelAgenda ahora={ahora} />
          <Glosario ahora={ahora} />
        </Seccion>

        {/* Personal: Mena Capital y Caja */}
        <Seccion id="dinero" titulo="Tu dinero" para="Tu Portafolio Financiero y tu Presupuesto. Los anotas tú y solo tú los ves.">
          <ResumenCapital />
          <HallazgosCapital />
          <ResumenCaja ahora={ahora} />
        </Seccion>
      </main>
      {/* 17 */}
      <Pie ahora={ahora} estado={estado} />
      <Actualizador />
      <Bienvenida />
    </>
  );
}
