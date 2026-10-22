// Boletín de tasas de RD: tasas activas (préstamos) y pasivas (ahorros y depósitos) del BCRD, con su mes,
// en dos pestañas. Cada cifra con su fuente. La subasta de Hacienda, los fondos y los datos cargados a
// mano tienen ahora su propio panel (PanelSubastas, PanelFondos, PanelManuales).

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra } from "@/lib/formato";
import { type DatoRD, FILAS_ACTIVAS, FILAS_PASIVAS, mesCorto, ultimosDatos } from "@/lib/rd";
import { Cabecera, Cambio, ICONOS_RD, QueEs, SellosAgrupados, SinDatos, tareaDe } from "./comun";
import { Pestanas } from "./Pestanas";

export async function BoletinTasas({ ancho = false }: { ancho?: boolean } = {}) {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Boletín de tasas" mensaje={(e as Error).message} />;
  }
  return <VistaBoletinTasas d={d} ahora={ahora} ancho={ancho} />;
}

function CeldaTasa({ dato, mesComun }: { dato: DatoRD | undefined; mesComun: string | null }) {
  if (!dato) {
    return (
      <td className="num">
        <span className="rd-sin-cifra" title="Sin dato publicado">
          sin dato
        </span>
      </td>
    );
  }
  const mes = mesCorto(dato.obs.fecha_dato);
  return (
    <td className="num rd-celda-tasa">
      <span className="rd-tasa">{cifra(dato.obs.valor, 2)}%</span>
      {dato.obs.cambio !== null ? (
        <span className="rd-tasa-cambio">
          <Cambio cambio={dato.obs.cambio} pb />
        </span>
      ) : null}
      {mes !== mesComun ? <span className="rd-mes">{mes}</span> : null}
      {dato.desactualizado ? <span className="rd-pildora-vieja">Dato viejo</span> : null}
    </td>
  );
}

function TablaTasas({
  id,
  descripcion,
  filas,
  datos,
  d,
  ahora,
}: {
  id: string;
  descripcion: string;
  filas: typeof FILAS_ACTIVAS;
  datos: Map<string, DatoRD>;
  d: DatosRD;
  ahora: Date;
}) {
  const presentes = filas.flatMap(([, mn, me]) => [mn, me]).map((s) => (s ? datos.get(s) : undefined)).filter((x): x is DatoRD => !!x);
  // El mes más frecuente va arriba; las celdas de otro mes lo indican.
  const conteo = new Map<string, number>();
  for (const p of presentes) {
    const m = mesCorto(p.obs.fecha_dato);
    conteo.set(m, (conteo.get(m) ?? 0) + 1);
  }
  const mesComun = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (presentes.length === 0) {
    return (
      <SinDatos tarea={tareaDe(d.tareas, "bcrd-excel")}>
        Sin datos todavía: los cuadros de tasas del BCRD se leen los días hábiles a las 10:00 AM (hora RD).
      </SinDatos>
    );
  }
  return (
    <>
      <p className="rd-nota-tabla">
        {descripcion}
        {mesComun ? <span className="etiqueta neutra">{mesComun}</span> : null}
      </p>
      <div className="desplazable">
        <table className="tabla rd-tabla-tasas" aria-describedby={`${id}-d`}>
          <caption className="sr-solo" id={`${id}-d`}>
            {descripcion}
          </caption>
          <thead>
            <tr>
              <th scope="col">Tipo (tasa anual)</th>
              <th scope="col" className="num">
                En pesos
              </th>
              <th scope="col" className="num">
                En dólares
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([etiqueta, mn, me]) => (
              <tr key={etiqueta}>
                <th scope="row">{etiqueta}</th>
                {mn ? (
                  <CeldaTasa dato={datos.get(mn)} mesComun={mesComun} />
                ) : (
                  <td className="num">
                    <span className="rd-sin-cifra" title="El BCRD no publica esta tasa en esta moneda">
                      no aplica
                    </span>
                  </td>
                )}
                {me ? (
                  <CeldaTasa dato={datos.get(me)} mesComun={mesComun} />
                ) : (
                  <td className="num">
                    <span className="rd-sin-cifra" title="El BCRD no publica esta tasa en esta moneda">
                      no aplica
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SellosAgrupados datos={presentes} tareas={d.tareas} ahora={ahora} />
    </>
  );
}

export function VistaBoletinTasas({ d, ahora, ancho = false }: { d: DatosRD; ahora: Date; ancho?: boolean }) {
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  return (
    <section className={`panel rd-panel${ancho ? " panel-ancho" : ""}`} aria-labelledby="t-boletin">
      <Cabecera
        id="t-boletin"
        titulo="Boletín de tasas"
        icono={ICONOS_RD.tasas}
        para="Lo que cobran los bancos por prestar y lo que pagan por tu ahorro (promedio de todos los bancos)."
        ayuda={
          <QueEs titulo="Tasas activas y pasivas">
            Activa es lo que te cobra el banco por un préstamo; pasiva es lo que te paga por tu dinero en ahorro o a plazo. Son
            promedios del Banco Central, no la oferta de un banco.
          </QueEs>
        }
      />
      <div className="panel-cuerpo">
        <Pestanas
          etiqueta="Tipo de tasa"
          pestanas={[
            {
              id: "activas",
              titulo: "Préstamos (activas)",
              contenido: (
                <TablaTasas
                  id="t-activas"
                  descripcion="Lo que cobran los bancos múltiples por prestar."
                  filas={FILAS_ACTIVAS}
                  datos={datos}
                  d={d}
                  ahora={ahora}
                />
              ),
            },
            {
              id: "pasivas",
              titulo: "Ahorros (pasivas)",
              contenido: (
                <TablaTasas
                  id="t-pasivas"
                  descripcion="Lo que pagan los bancos múltiples por tu ahorro y tus depósitos a plazo."
                  filas={FILAS_PASIVAS}
                  datos={datos}
                  d={d}
                  ahora={ahora}
                />
              ),
            },
          ]}
        />
      </div>
    </section>
  );
}
