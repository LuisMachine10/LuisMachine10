// Glosario: 3–5 «conceptos del día» según lo que se movió y lo que hay en pantalla, más el glosario completo.

import { conceptosDelDia, GLOSARIO } from "@/lib/glosario";
import { leerMovimientos, leerNoticias } from "@/lib/datos-noticias";
import { type CategoriaNoticia, conteoCategorias, hoyRD, masMovidas } from "@/lib/noticias";
import { Cabecera } from "./comun";

export async function Glosario({ ahora = new Date() }: { ahora?: Date }) {
  // Si la base no responde, el glosario igual se muestra (rotación del día), sin inventar contexto.
  let seriesMovidas: string[] = [];
  let categorias: CategoriaNoticia[] = [];
  try {
    const [movs, { noticias }] = await Promise.all([leerMovimientos(), leerNoticias(24)]);
    seriesMovidas = masMovidas(movs, ahora, 5).map((m) => m.serie_id);
    const conteo = conteoCategorias(noticias);
    categorias = (Object.keys(conteo) as CategoriaNoticia[]).filter((c) => conteo[c] > 0).sort((a, b) => conteo[b] - conteo[a]);
  } catch {
    // sin contexto: se usa solo la rotación
  }
  const delDia = conceptosDelDia({ seriesMovidas, categorias, fecha: hoyRD(ahora) });
  const ordenado = [...GLOSARIO].sort((a, b) => a.termino.localeCompare(b.termino, "es"));

  return (
    <section className="panel" aria-labelledby="titulo-glosario">
      <Cabecera id="titulo-glosario" titulo="Glosario">
        <span className="sello">Conceptos del día según lo que se movió y lo que hay en pantalla</span>
      </Cabecera>
      <div className="panel-cuerpo">
        <dl className="nt-glosario">
          {delDia.map((c) => (
            <div key={c.id} className="nt-concepto">
              <dt>{c.termino}</dt>
              <dd>{c.definicion}</dd>
            </div>
          ))}
        </dl>
        <details className="nt-detalles">
          <summary>Ver los {GLOSARIO.length} conceptos</summary>
          <dl className="nt-glosario nt-glosario-todo">
            {ordenado.map((c) => (
              <div key={c.id} className="nt-concepto">
                <dt>{c.termino}</dt>
                <dd>{c.definicion}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
