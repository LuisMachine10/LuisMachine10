import { Actualizador } from "@/componentes/Actualizador";
import { CurvaTesoro } from "@/componentes/CurvaTesoro";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelError } from "@/componentes/PanelError";
import { armarCurva } from "@/lib/curva";
import { datosTesoro } from "@/lib/datos";
import { fechaCorta } from "@/lib/formato";
import { frescura } from "@/lib/frescura";

export const dynamic = "force-dynamic";

export default async function Terminal() {
  const ahora = new Date();
  let datos: Awaited<ReturnType<typeof datosTesoro>>;
  try {
    datos = await datosTesoro();
  } catch (e) {
    return (
      <>
        <Encabezado actual="terminal" ultimaActualizacion={null} />
        <main className="terminal">
          <PanelError titulo="Curva del Tesoro de EE. UU." mensaje={(e as Error).message} />
        </main>
      </>
    );
  }
  const { series, observaciones, fuente, tarea } = datos;
  const curva = armarCurva(series, observaciones);
  const ultima = observaciones.map((o) => o.recogido_en).sort().at(-1) ?? null;

  const noConfirmado: string[] = [];
  if (!curva) noConfirmado.push("Curva del Tesoro: sin datos todavía.");
  else if (frescura({ fecha_dato: curva.fecha }, curva.maxAntiguedadMin, ahora).desactualizado)
    noConfirmado.push(`Curva del Tesoro: el último dato es del ${fechaCorta(curva.fecha)} (desactualizado).`);
  if (tarea?.estado === "error") noConfirmado.push(`Lectura del Tesoro con error: ${tarea.error ?? "sin detalle"}.`);

  return (
    <>
      <Encabezado actual="terminal" ultimaActualizacion={tarea?.ultima_ok ?? ultima} />
      <main className="terminal">
        <CurvaTesoro curva={curva} tarea={tarea} fuente={fuente} ahora={ahora} />
      </main>
      <footer className="pie">
        <h2>Fuentes</h2>
        <ul>
          <li>
            <a href={fuente.url} target="_blank" rel="noopener noreferrer">
              {fuente.nombre}
            </a>
          </li>
        </ul>
        <h2>No confirmado</h2>
        {noConfirmado.length ? (
          <ul>
            {noConfirmado.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p>Todo lo que se ve tiene fuente y está dentro de su antigüedad máxima.</p>
        )}
        <p>Strategya no es asesoría de inversión. Cifras de fuentes oficiales; ninguna sale de un modelo de lenguaje.</p>
      </footer>
      <Actualizador />
    </>
  );
}
