// Glosario en acordeón: 3–5 «conceptos del día» según lo que se movió y lo que hay en pantalla, más el
// glosario completo (cada concepto se abre por separado).

import { conceptosDelDia, GLOSARIO } from "@/lib/glosario";
import { leerMovimientos, leerNoticias } from "@/lib/datos-noticias";
import { type CategoriaNoticia, conteoCategorias, hoyRD, masMovidas } from "@/lib/noticias";
import { Cabecera, ICONO, Icono } from "./comun";

function Concepto({ termino, definicion, abierto = false }: { termino: string; definicion: string; abierto?: boolean }) {
  return (
    <details className="nt-concepto" open={abierto}>
      <summary>
        <span>{termino}</span>
        <Icono d={ICONO.chevron} tam={16} className="nt-chevron" />
      </summary>
      <p>{definicion}</p>
    </details>
  );
}

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
    <section className="panel nt-panel" aria-labelledby="titulo-glosario">
      <Cabecera id="titulo-glosario" titulo="Glosario">
        <span className="sello" title="Conceptos elegidos según lo que se movió y lo que hay en pantalla">
          Conceptos del día
        </span>
      </Cabecera>
      <div className="panel-cuerpo">
        <div className="nt-acordeon">
          {delDia.map((c, i) => (
            <Concepto key={c.id} termino={c.termino} definicion={c.definicion} abierto={i === 0} />
          ))}
        </div>
        <details className="nt-detalles nt-glosario-todo">
          <summary>
            <Icono d={ICONO.libro} tam={15} />
            Ver los {GLOSARIO.length} conceptos
          </summary>
          <div className="nt-acordeon nt-acordeon-todo">
            {ordenado.map((c) => (
              <Concepto key={c.id} termino={c.termino} definicion={c.definicion} />
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
