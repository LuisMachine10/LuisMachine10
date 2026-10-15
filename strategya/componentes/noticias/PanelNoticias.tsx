// Últimos titulares (GDELT + prensa por RSS) con medio, hora RD, categoría y lugar.
// Solo titular y enlace: el texto del artículo nunca se guarda ni se muestra.

import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { leerNoticias } from "@/lib/datos-noticias";
import { ZONA_RD } from "@/lib/formato";
import { type CategoriaNoticia, conteoCategorias, ETIQUETA_CATEGORIA, fechaEnZona, filtrarNoticias } from "@/lib/noticias";
import { algunaFallo, Cabecera, EtiquetaCategoria, Hora, ultimaOk } from "./comun";

/** Si el titular más reciente tiene más de 3 h, el panel se marca DESACTUALIZADO. */
const MAX_ANTIGUEDAD_MIN = 180;

export async function PanelNoticias({
  categoria,
  limite = 15,
  ahora = new Date(),
}: {
  /** Solo una categoría (p. ej. "rd" para la sección de RD). Sin valor: todas. */
  categoria?: CategoriaNoticia;
  limite?: number;
  ahora?: Date;
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

  return (
    <section className="panel" aria-labelledby={id}>
      <Cabecera id={id} titulo={titulo}>
        {masReciente ? (
          <SelloFuente
            ahora={ahora}
            d={{
              fuente: "GDELT y prensa (RSS)",
              url: "https://www.gdeltproject.org/",
              fechaDato: fechaEnZona(masReciente, ZONA_RD),
              verificadoEn: ultimaOk(datos.tareas),
              desactualizado: ahora.getTime() - new Date(masReciente).getTime() > MAX_ANTIGUEDAD_MIN * 60_000,
              ultimaCorridaFallo: algunaFallo(datos.tareas),
            }}
          />
        ) : null}
      </Cabecera>
      {lista.length === 0 ? (
        <div className="vacio">
          Sin titulares en las últimas 48 horas. GDELT se consulta cada 10 minutos (rota guerras, mercados y RD) y la
          prensa por RSS cada 30 minutos.
          {algunaFallo(datos.tareas) ? <p className="baja chico">La última lectura falló: ver Estado.</p> : null}
        </div>
      ) : (
        <div className="panel-cuerpo">
          {!categoria ? (
            <p className="chico tenue nt-resumen">
              48 h:{" "}
              {(Object.keys(conteo) as CategoriaNoticia[]).map((c, i) => (
                <span key={c}>
                  {i > 0 ? " · " : ""}
                  {ETIQUETA_CATEGORIA[c]} <span className="mono">{conteo[c]}</span>
                </span>
              ))}
            </p>
          ) : null}
          <ol className="nt-lista">
            {lista.map((n) => (
              <li key={n.id} className="nt-item">
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="nt-titular">
                  {n.titular}
                </a>
                <span className="nt-meta">
                  {!categoria ? <EtiquetaCategoria c={n.categoria} /> : null}
                  <span>{n.medio}</span>
                  <span>
                    · <Hora iso={n.fecha} ahora={ahora} />
                  </span>
                  {n.lugar ? <span>· {n.lugar}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="chico tenue">Solo titulares y enlaces a cada medio. Hora de RD.</p>
        </div>
      )}
    </section>
  );
}
