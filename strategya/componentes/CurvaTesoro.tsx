import "@/estilos/mercado.css";
import Big from "big.js";
import type { Curva } from "@/lib/curva";
import { cifra, direccion, fechaCorta, puntosBasicos } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { GraficoCurva, type PuntoGrafico } from "./GraficoCurva";
import { SelloFuente } from "./SelloFuente";

export interface EstadoTarea {
  estado: string;
  inicio: string;
  ultima_ok: string | null;
  error: string | null;
}

const FLECHA = { sube: "↑", baja: "↓", igual: "→" } as const;
const PALABRA = { sube: "sube", baja: "baja", igual: "sin cambio" } as const;

export function CurvaTesoro({
  curva,
  tarea,
  fuente,
  ahora,
}: {
  curva: Curva | null;
  tarea: EstadoTarea | null;
  fuente: { nombre: string; url: string };
  ahora: Date;
}) {
  return (
    <section className="panel panel-ancho" aria-labelledby="titulo-curva">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="titulo-curva">
          Curva del Tesoro de EE. UU.
        </h2>
        <span className="mv-nota-cab">Rendimiento par, %</span>
      </div>
      {curva ? <Cuerpo curva={curva} tarea={tarea} fuente={fuente} ahora={ahora} /> : <SinDatos tarea={tarea} />}
    </section>
  );
}

function SinDatos({ tarea }: { tarea: EstadoTarea | null }) {
  return (
    <div className="mv-vacio">
      <p>Sin datos todavía.</p>
      <p className="chico tenue">
        La lectura del Tesoro corre de lunes a viernes a las 6:15 PM y 7:45 PM, y de lunes a sábado a las 7:00 AM (hora RD).
      </p>
      {tarea?.estado === "error" && tarea.error ? <p className="baja chico">Última lectura con error: {tarea.error}</p> : null}
      <a className="boton secundario" href="/estado">
        Ver el estado de las lecturas
      </a>
    </div>
  );
}

function Cifra({ rotulo, valor, cambio }: { rotulo: string; valor: string; cambio: string | null }) {
  const dir = direccion(cambio);
  return (
    <div className="curva-kpi">
      <span className="curva-kpi-rotulo">{rotulo}</span>
      <span className="curva-kpi-valor mono">{valor}</span>
      {cambio !== null ? (
        <span className={`pastilla ${dir}`}>
          <span aria-hidden="true">{FLECHA[dir]}</span>
          <span className="sr-solo">{PALABRA[dir]} </span>
          {puntosBasicos(cambio)}
        </span>
      ) : null}
    </div>
  );
}

function Cuerpo({
  curva,
  tarea,
  fuente,
  ahora,
}: {
  curva: Curva;
  tarea: EstadoTarea | null;
  fuente: { nombre: string; url: string };
  ahora: Date;
}) {
  const puntosGrafico: PuntoGrafico[] = curva.puntos.map((p) => ({
    plazo: p.plazo,
    nombre: p.nombre,
    valor: cifra(p.valor, 2),
    valorComparacion: p.valorComparacion ? cifra(p.valorComparacion, 2) : null,
    diferencia: p.valorComparacion ? puntosBasicos(new Big(p.valor).minus(p.valorComparacion).toString()) : null,
  }));
  const diez = curva.puntos.find((p) => p.serieId === "UST_10A");
  const dos = curva.puntos.find((p) => p.serieId === "UST_2A");
  const pendiente = diez && dos ? new Big(diez.valor).minus(dos.valor).toString() : null;

  return (
    <div className="panel-cuerpo">
      <div className="curva-kpis">
        {dos ? <Cifra rotulo="2 años" valor={`${cifra(dos.valor, 2)}%`} cambio={dos.cambio} /> : null}
        {diez ? <Cifra rotulo="10 años" valor={`${cifra(diez.valor, 2)}%`} cambio={diez.cambio} /> : null}
        {pendiente ? (
          <div className="curva-kpi">
            <span className="curva-kpi-rotulo">Pendiente 10A − 2A</span>
            <span className="curva-kpi-valor mono">{puntosBasicos(pendiente)}</span>
          </div>
        ) : null}
      </div>
      <GraficoCurva
        puntos={puntosGrafico}
        etiquetaActual={fechaCorta(curva.fecha)}
        etiquetaComparacion={curva.fechaComparacion ? fechaCorta(curva.fechaComparacion) : null}
      />
      <SelloFuente
        ahora={ahora}
        d={{
          fuente: "Tesoro de EE. UU.",
          url: curva.urlDato ?? fuente.url,
          fechaDato: curva.fecha,
          verificadoEn: tarea?.ultima_ok ?? curva.recogidoEn,
          desactualizado: frescura({ fecha_dato: curva.fecha }, curva.maxAntiguedadMin, ahora).desactualizado,
          ultimaCorridaFallo: tarea?.estado === "error",
        }}
      />
      <details className="mv-detalles">
        <summary>Tabla por plazo</summary>
        <div className="desplazable">
          <table className="tabla">
            <caption className="sr-solo">Rendimientos par del Tesoro por plazo, en porcentaje</caption>
            <thead>
              <tr>
                <th scope="col">Plazo</th>
                <th scope="col" className="num">
                  Rend. %
                </th>
                <th scope="col" className="num">
                  Día
                </th>
                <th scope="col" className="num">
                  {curva.fechaComparacion ? `vs ${fechaCorta(curva.fechaComparacion, false)}` : "vs 1 mes"}
                </th>
              </tr>
            </thead>
            <tbody>
              {curva.puntos.map((p, i) => {
                const dir = direccion(p.cambio);
                const g = puntosGrafico[i];
                return (
                  <tr key={p.serieId}>
                    <th scope="row">
                      {p.plazo} <span className="tenue chico">{p.nombre.replace("Tesoro EE. UU. ", "")}</span>
                    </th>
                    <td className="num">{g.valor}</td>
                    <td className={`num ${dir}`}>
                      {p.cambio === null ? (
                        <span className="tenue">—</span>
                      ) : (
                        <>
                          <span aria-hidden="true">{FLECHA[dir]} </span>
                          <span className="sr-solo">{PALABRA[dir]} </span>
                          {puntosBasicos(p.cambio)}
                        </>
                      )}
                    </td>
                    <td className="num tenue">{g.diferencia ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {curva.faltantes.length ? (
          <p className="chico tenue">No publicado por la fuente ese día: {curva.faltantes.join(", ")}.</p>
        ) : null}
      </details>
    </div>
  );
}
