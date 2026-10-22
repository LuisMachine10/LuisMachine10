// Datos que Mena agregó a mano (cualquier serie), cada uno con su fecha y el enlace de donde salió.

import "@/estilos/rd.css";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { Cabecera, ICONOS_RD, SinDatos } from "./comun";

const MOSTRAR = 8;

export async function PanelManuales() {
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Datos agregados a mano" mensaje={(e as Error).message} />;
  }
  return <VistaPanelManuales d={d} />;
}

/** El valor tal como se guardó; si es un número, con separador de miles. */
function valor(v: string): string {
  return /^-?\d+(\.\d+)?$/.test(v) ? cifra(v, v.includes(".") ? v.split(".")[1].length : 0) : v;
}

export function VistaPanelManuales({ d }: { d: DatosRD }) {
  const lista = d.manuales.slice(0, MOSTRAR);
  return (
    <section className="panel rd-panel" aria-labelledby="t-manuales">
      <Cabecera
        id="t-manuales"
        titulo="Datos agregados a mano"
        icono={ICONOS_RD.lapiz}
        para="Cifras oficiales que escribiste tú porque Strategya no las trae sola. Cada una con su enlace."
      />
      <div className="panel-cuerpo">
        {lista.length === 0 ? (
          <SinDatos accion={{ href: "/carga", texto: "Agregar un dato" }}>
            Ninguno todavía. Sirve para una cifra oficial que no se lee sola, por ejemplo el rendimiento de un fondo de BHD o una
            tasa de otro banco central.
          </SinDatos>
        ) : (
          <>
            <ul className="rd-manuales">
              {lista.map((m) => (
                <li key={m.id}>
                  <span className="rd-manual-dato">
                    {m.dato}
                    {m.nota ? <span className="rd-mes">{m.nota}</span> : null}
                  </span>
                  <span className="rd-manual-valor mono">{valor(m.valor)}</span>
                  <span className="sello">
                    <span className="mono">{fechaCorta(m.fecha, false)}</span>
                    {m.url_fuente ? (
                      <a href={m.url_fuente} target="_blank" rel="noopener noreferrer">
                        fuente <span aria-hidden="true">↗</span>
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="rd-nota">
              <Link href="/carga">Agregar otro dato</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
