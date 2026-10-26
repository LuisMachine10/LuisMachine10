import "@/estilos/boletin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Actualizador } from "@/componentes/Actualizador";
import { PanelProbar } from "@/componentes/boletin/Controles";
import { EtiquetaEstado } from "@/componentes/boletin/Edicion";
import { Encabezado } from "@/componentes/Encabezado";
import { IntroPantalla } from "@/componentes/IntroPantalla";
import { PanelError } from "@/componentes/PanelError";
import { cuandoSale, esTipo, NOMBRE_TIPO, normalizarPrefBoletin } from "@/lib/boletin/preferencias";
import { leerPreferencia } from "@/lib/dashboard/datos";
import { type FilaEdicion, listarEdiciones, refrescarFotoTuDinero } from "@/lib/datos-boletin";
import { fechaCorta, fechaHoraRD } from "@/lib/formato";
import { TIPOS_EDICION } from "@/supabase/functions/_shared/boletin/tipos";

export const metadata: Metadata = { title: "Boletín · Strategya" };
export const dynamic = "force-dynamic";

function Filtros({ actual }: { actual: string | null }) {
  const opciones: { valor: string | null; texto: string }[] = [{ valor: null, texto: "Todas" }, ...TIPOS_EDICION.map((t) => ({ valor: t, texto: NOMBRE_TIPO[t] }))];
  return (
    <nav aria-label="Filtrar por tipo de edición">
      <ul className="bol-filtros">
        {opciones.map((o) => (
          <li key={o.texto}>
            <Link href={o.valor ? `/boletin?tipo=${o.valor}` : "/boletin"} aria-current={actual === o.valor ? "page" : undefined}>
              {o.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Fila({ e }: { e: FilaEdicion }) {
  return (
    <li>
      <span className="bol-lista-asunto">
        <Link href={`/boletin/${e.id}`}>{e.asunto ?? `${NOMBRE_TIPO[e.tipo]} · ${fechaCorta(e.fecha, false)}`}</Link>
      </span>
      <span className="bol-lista-estado">
        {e.prueba ? <span className="etiqueta neutra">Prueba</span> : null}
        <EtiquetaEstado estado={e.estado} />
      </span>
      <span className="bol-lista-meta">
        <span>{NOMBRE_TIPO[e.tipo]}</span>
        <span>{fechaCorta(e.fecha)}</span>
        {e.enviado_en ? <span>enviada {fechaHoraRD(e.enviado_en)}</span> : <span>armada {fechaHoraRD(e.creado_en)}</span>}
        {e.palabras ? <span>{e.palabras} palabras</span> : null}
        {e.con_tu_dinero ? <span>con «Tu dinero»</span> : null}
      </span>
      {e.error ? <p className="bol-error">{e.error}</p> : null}
    </li>
  );
}

export default async function PaginaBoletin({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const q = await searchParams;
  const tipo = esTipo(q.tipo) ? q.tipo : null;
  // De paso se refresca la foto de «Tu dinero» (la usan las ediciones de la mañana); nunca falla la página.
  const [lectura, pref] = await Promise.all([
    listarEdiciones(tipo).then((d) => ({ d, error: null as string | null }), (e: Error) => ({ d: null, error: e.message })),
    leerPreferencia("boletin"),
    refrescarFotoTuDinero(),
  ]);
  const p = normalizarPrefBoletin(pref.valor);

  return (
    <>
      <Encabezado actual="boletin" ultimaActualizacion={null} />
      <main className="terminal">
        <IntroPantalla clave="boletin" />

        <section className="panel" aria-labelledby="t-probar">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-probar">
              Probar una edición
            </h2>
          </div>
          <div className="panel-cuerpo">
            <PanelProbar inicial={tipo ?? "am"} />
          </div>
        </section>

        <section className="panel" aria-labelledby="t-horario">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-horario">
              Cuándo sale cada una
            </h2>
            <Link href="/ajustes#t-boletin" className="chico">
              Cambiar en Ajustes →
            </Link>
          </div>
          <div className="panel-cuerpo">
            <ul className="bol-horario">
              {TIPOS_EDICION.map((t) => (
                <li key={t}>
                  <strong>{NOMBRE_TIPO[t]}</strong>
                  <span className={`etiqueta ${p[t] ? "ok" : "neutra"}`}>{p[t] ? "Activa" : "Apagada"}</span>
                  <small>{cuandoSale(t)}</small>
                </li>
              ))}
              <li>
                <strong>«Tu dinero» en el correo</strong>
                <span className={`etiqueta ${p.tu_dinero ? "ok" : "neutra"}`}>{p.tu_dinero ? "Sí" : "No"}</span>
                <small>Va en la AM y en la de fin de semana. Solo te llega a ti y solo tú la ves aquí.</small>
              </li>
            </ul>
          </div>
        </section>

        <section className="panel panel-ancho" aria-labelledby="t-ediciones">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-ediciones">
              Ediciones
            </h2>
            <span className="tenue chico">La más reciente primero. Cada una se ve igual que el correo.</span>
          </div>
          <div className="panel-cuerpo">
            <Filtros actual={tipo} />
            {lectura.d === null ? (
              <PanelError titulo="Ediciones" mensaje={lectura.error ?? "No se pudieron leer."} />
            ) : lectura.d.length ? (
              <ol className="bol-lista">
                {lectura.d.map((e) => (
                  <Fila key={e.id} e={e} />
                ))}
              </ol>
            ) : (
              <p className="bol-vacio-lista">
                Todavía no ha salido {tipo ? `ninguna «${NOMBRE_TIPO[tipo]}»` : "ninguna edición"}. Salen solas a su hora; mientras tanto, usa «Vista previa ahora» para ver
                cómo quedaría con los datos de este momento.
              </p>
            )}
          </div>
        </section>
      </main>
      <footer className="pie">
        <p>
          El Boletín se arma por reglas con los datos ya guardados en Strategya: ninguna cifra sale de una inteligencia artificial. Cada cifra lleva su
          fuente y su fecha; lo que falta dice «no confirmado». Es información, no asesoría de inversión.
        </p>
      </footer>
      <Actualizador />
    </>
  );
}
