// Combustibles y derivados del petróleo: precios oficiales de la semana (aviso del MICM), compactos, con su
// cambio semanal, y el Brent de referencia en una línea. Cada cifra con su fuente.

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { type DatoRD, semanaVigencia, SERIES_COMBUSTIBLES, ultimosDatos } from "@/lib/rd";
import { Cabecera, Cambio, ICONOS_RD, QueEs, SellosAgrupados, SinDatos, tareaDe } from "./comun";

export async function PanelCombustibles() {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Combustibles y derivados del petróleo" mensaje={(e as Error).message} />;
  }
  return <VistaPanelCombustibles d={d} ahora={ahora} />;
}

function Brent({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const b = d.brent;
  const serie = d.seriesExtra.find((s) => s.id === "BRENT");
  if (!b || !serie) {
    return <p className="rd-brent rd-brent-vacio">Brent de referencia: sin dato todavía (se ve en Mercados cuando llega).</p>;
  }
  const fuente = d.fuentes.find((f) => f.id === b.fuente_id);
  // Un cierre diario (FRED) vale hasta el siguiente; una cotización intradía, lo que diga su serie.
  const max = b.hora_dato ? serie.max_antiguedad_min : 4 * 1440;
  return (
    <div className="rd-brent">
      <span className="rd-brent-nombre">
        Brent{" "}
        <QueEs titulo="Brent">
          El precio del barril de petróleo de referencia en el mundo. Cuando sube por varias semanas, los combustibles en RD
          suelen subir después.
        </QueEs>
      </span>
      <span className="rd-brent-cifra">
        <span className="rd-moneda">US$</span> <span className="mono rd-fuerte">{cifra(b.valor, 2)}</span>{" "}
        <span className="rd-moneda">por barril</span>
      </span>
      <Cambio cambio={b.cambio} decimales={2} pastilla />
      <SelloFuente
        ahora={ahora}
        d={{
          fuente: fuente?.nombre ?? b.fuente_id,
          url: b.url_dato ?? fuente?.url ?? null,
          fechaDato: b.fecha_dato,
          verificadoEn: b.recogido_en,
          desactualizado: frescura({ fecha_dato: b.fecha_dato, hora_dato: b.hora_dato }, max, ahora).desactualizado,
          ultimaCorridaFallo: false,
        }}
      />
    </div>
  );
}

export function VistaPanelCombustibles({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const filas = SERIES_COMBUSTIBLES.map((s) => datos.get(s)).filter((x): x is DatoRD => !!x);
  const semana = filas.map((f) => f.obs.fecha_dato).sort().at(-1);
  const tarea = tareaDe(d.tareas, "micm");
  const aviso = d.avisos.find((a) => a.institucion === "MICM");

  return (
    <section className="panel rd-panel" aria-labelledby="t-combustibles">
      <Cabecera
        id="t-combustibles"
        titulo="Combustibles y derivados del petróleo"
        icono={ICONOS_RD.combustible}
        para={semana ? `Precio oficial por galón de la semana del ${semanaVigencia(semana)} (MICM).` : "Precio oficial por galón de la semana (MICM). Cambia cada viernes."}
      />
      <div className="panel-cuerpo rd-contenedor">
        <Brent d={d} ahora={ahora} />
        {filas.length === 0 ? (
          <SinDatos tarea={tarea} accion={{ href: "/carga#t-carga-comb", texto: "Agregar precios a mano" }}>
            Sin precios todavía. El aviso del MICM sale los viernes y se lee el viernes a las 7:30 PM y el sábado a las 9:30 AM.
            {aviso ? (
              <>
                {" "}
                Último aviso:{" "}
                <a href={aviso.url} target="_blank" rel="noopener noreferrer">
                  {aviso.titulo} ↗
                </a>
              </>
            ) : null}
          </SinDatos>
        ) : (
          <>
            <table className="rd-precios">
              <caption className="sr-solo">Precios oficiales de combustibles de la semana, en RD$, con el cambio contra la semana anterior</caption>
              <thead className="sr-solo">
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Precio RD$</th>
                  <th scope="col">Cambio semanal</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.serie.id}>
                    <th scope="row" title={f.serie.unidad.replace("RD$/", "RD$ por ")}>
                      {f.serie.nombre}
                      {f.obs.fecha_dato !== semana ? <span className="rd-mes">semana del {fechaCorta(f.obs.fecha_dato, false)}</span> : null}
                      {f.serie.unidad !== "RD$/galón" ? <span className="rd-mes">{f.serie.unidad.replace("RD$/", "RD$ por ")}</span> : null}
                    </th>
                    <td className="rd-precio mono">{cifra(f.obs.valor, 2)}</td>
                    <td className="rd-precio-cambio">
                      <Cambio cambio={f.obs.cambio} decimales={2} pastilla />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SellosAgrupados datos={filas} tareas={d.tareas} ahora={ahora} />
          </>
        )}
      </div>
    </section>
  );
}
