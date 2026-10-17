// Últimos titulares (GDELT + prensa por RSS) como tarjetas: categoría, medio, hora RD y lugar.
// Solo titular y enlace: el texto del artículo nunca se guarda ni se muestra.

import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { leerNoticias } from "@/lib/datos-noticias";
import { ZONA_RD } from "@/lib/formato";
import { type CategoriaNoticia, conteoCategorias, ETIQUETA_CATEGORIA, fechaEnZona, filtrarNoticias } from "@/lib/noticias";
import { algunaFallo, Cabecera, EtiquetaCategoria, Hora, ICONO, Icono, ultimaOk, Vacio } from "./comun";

/** Si el titular más reciente tiene más de 3 h, el panel se marca DESACTUALIZADO. */
const MAX_ANTIGUEDAD_MIN = 180;

export async function PanelNoticias({
  categoria,
  limite = 15,
  ahora = new Date(),
  ancho = false,
}: {
  /** Solo una categoría (p. ej. "rd" para la sección de RD). Sin valor: todas. */
  categoria?: CategoriaNoticia;
  limite?: number;
  ahora?: Date;
  /** Ocupa todo el ancho de la rejilla (las tarjetas pasan a varias columnas). */
  ancho?: boolean;
}) {
  const titulo = categoria ? `Noticias · ${ETIQUETA_CATEGORIA[categoria]}` : "Noticias";
  let datos: Awaited<ReturnType<typeof leerNoticias>>;
  try {
    datos = await leerNoticias();
  } catch (e) {
    return <PanelError titulo={titulo} mensaje={(e as Error).message} />;
  }
  const lista = filtrarNoticias(datos.noticias, categoria, limite);
  const conteo = conteoCategorias(datos.noticias);
  const masReciente = lista[0]?.fecha ?? null;
  const id = `titulo-noticias${categoria ? `-${categoria}` : ""}`;
  const fallo = algunaFallo(datos.tareas);

  return (
    <section className={`panel nt-panel${ancho ? " panel-ancho" : ""}`} aria-labelledby={id}>
      <Cabecera id={id} titulo={titulo}>
        {!categoria && lista.length ? (
          <ul className="nt-conteo" aria-label="Titulares de las últimas 48 horas por categoría">
            {(Object.keys(conteo) as CategoriaNoticia[])
              .filter((c) => conteo[c] > 0)
              .map((c) => (
                <li key={c} className={`nt-cat-${c}`}>
                  {ETIQUETA_CATEGORIA[c]} <span className="mono">{conteo[c]}</span>
                </li>
              ))}
          </ul>
        ) : null}
      </Cabecera>
      {lista.length === 0 ? (
        <Vacio titulo="Sin titulares en las últimas 48 horas">
          GDELT se consulta cada 10 minutos (rota guerras, mercados y RD) y la prensa por RSS cada 30 minutos.
          {fallo ? <p className="baja chico">La última lectura falló: ver Estado.</p> : null}
        </Vacio>
      ) : (
        <div className="panel-cuerpo">
          <ol className={`nt-tarjetas${ancho ? " nt-tarjetas-ancho" : ""}`}>
            {lista.map((n) => (
              <li key={n.id} className={`nt-tarjeta nt-borde-${n.categoria}`}>
                <div className="nt-tarjeta-meta">
                  {!categoria ? <EtiquetaCategoria c={n.categoria} /> : null}
                  <span className="nt-medio">{n.medio}</span>
                  <span className="nt-hora">
                    <Hora iso={n.fecha} ahora={ahora} />
                  </span>
                </div>
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="nt-titular">
                  {n.titular}
                </a>
                {n.lugar ? (
                  <span className="nt-lugar">
                    <Icono d={ICONO.lugar} tam={13} />
                    {n.lugar}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {masReciente ? (
            <div className="nt-pie-panel">
              <SelloFuente
                ahora={ahora}
                d={{
                  fuente: "GDELT y prensa (RSS)",
                  url: "https://www.gdeltproject.org/",
                  fechaDato: fechaEnZona(masReciente, ZONA_RD),
                  verificadoEn: ultimaOk(datos.tareas),
                  desactualizado: ahora.getTime() - new Date(masReciente).getTime() > MAX_ANTIGUEDAD_MIN * 60_000,
                  ultimaCorridaFallo: fallo,
                }}
              />
              <span className="sello">Solo titulares y enlaces a cada medio · hora RD</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
