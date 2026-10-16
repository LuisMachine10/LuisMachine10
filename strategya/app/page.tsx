import { Actualizador } from "@/componentes/Actualizador";
import { BannerAlertas } from "@/componentes/alertas/BannerAlertas";
import { ResumenCaja } from "@/componentes/caja/ResumenCaja";
import { HallazgosCapital, ResumenCapital } from "@/componentes/capital/ResumenCapital";
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
import { BoletinTasas, PanelCombustibles, PanelEmisiones, PanelRD } from "@/componentes/rd";
import { armarCurva } from "@/lib/curva";
import { datosTesoro, estadoTareas } from "@/lib/datos";
import { fechaCorta, fechaHoraRD } from "@/lib/formato";
import { frescura } from "@/lib/frescura";

export const dynamic = "force-dynamic";

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
    <footer className="pie">
      <h2>Fuentes</h2>
      {fuentes.length ? (
        <ul>
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
      <h2>No confirmado</h2>
      {noConfirmado.length ? (
        <ul>
          {noConfirmado.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : (
        <p>Todas las lecturas automáticas terminaron bien. Cada cifra marca DESACTUALIZADO si pasa de su antigüedad máxima.</p>
      )}
      <p>
        Strategya no es asesoría de inversión. Cifras de fuentes oficiales; ninguna sale de un modelo de lenguaje.
        Página generada {fechaHoraRD(ahora.toISOString())} (hora RD).
      </p>
    </footer>
  );
}

export default async function Terminal() {
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
      <Encabezado actual="terminal" ultimaActualizacion={ultima} />
      <main className="terminal">
        <BannerAlertas />
        {/* 2 */}
        <CintaPrecios />
        {/* 3 */}
        <Mapa ahora={ahora} />
        <LasCincoDelDia />
        {/* 4 */}
        <GuerrasEnElMundo />
        {/* 5–7 */}
        <PanelIndices />
        <PanelAcciones />
        <PanelFusionesIPO ahora={ahora} />
        {/* 8–10 */}
        <PanelMetales />
        <PanelEnergia />
        <PanelTasasDivisas />
        <SeccionTesoro ahora={ahora} />
        {/* 11–13 */}
        <PanelRD />
        <PanelCombustibles />
        <BoletinTasas />
        <PanelEmisiones />
        {/* 14–15 */}
        <PanelInstituciones ahora={ahora} />
        <PanelAgenda ahora={ahora} />
        <PanelQueVigilar ahora={ahora} />
        <PanelNoticias ahora={ahora} />
        {/* 16 */}
        <Glosario ahora={ahora} />
        {/* Personal: Mena Capital y Caja */}
        <ResumenCapital />
        <HallazgosCapital />
        <ResumenCaja ahora={ahora} />
      </main>
      {/* 17 */}
      <Pie ahora={ahora} estado={estado} />
      <Actualizador />
    </>
  );
}
