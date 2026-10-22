// Widgets del Dashboard (Server Components). Cada uno lee sus datos, muestra su sello de fuente y,
// si no hay datos, se ve compacto con su motivo. Las lecturas se comparten por petición (cache).
//
// Para agregar un widget: su ficha en lib/dashboard/widgets.ts y su función en RENDER (abajo).

import "@/estilos/dashboard.css";
import Big from "big.js";
import Link from "next/link";
import { IconoCampana, valorConUnidad } from "@/componentes/alertas/BannerAlertas";
import { ResumenCaja } from "@/componentes/caja/ResumenCaja";
import { ResumenCapital } from "@/componentes/capital/ResumenCapital";
import { CurvaTesoro } from "@/componentes/CurvaTesoro";
import { LineaEvento } from "@/componentes/noticias/agenda-comun";
import { algunaFallo, EtiquetaCategoria, Hora, ultimaOk } from "@/componentes/noticias/comun";
import { Cambio, SellosAgrupados, Sello, tareaDeSerie } from "@/componentes/rd/comun";
import { GraficoDolar } from "@/componentes/rd/GraficoDolar";
import { SelloFuente } from "@/componentes/SelloFuente";
import { MosaicoHoy } from "@/componentes/terminal/BloqueHoy";
import { frasesHoy, NOTA_RESUMEN } from "@/componentes/terminal/ResumenDia";
import { armarCurva } from "@/lib/curva";
import { leerPreferencia } from "@/lib/dashboard/datos";
import { filtrarMisNoticias, mediosDisponibles, normalizarPref, sinFiltros } from "@/lib/dashboard/noticias";
import type { FichaWidget, Tamano } from "@/lib/dashboard/widgets";
import { datosTesoro } from "@/lib/datos";
import { alertasDeHoy } from "@/lib/datos-alertas-ia";
import { leerAgenda, leerNoticias } from "@/lib/datos-noticias";
import { datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta, horaRD, ZONA_RD } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { ETIQUETA_CATEGORIA, fechaEnZona, proximosEventos } from "@/lib/noticias";
import { brechaCambiaria, type DatoRD, fondosPorSafi, historial, semanaVigencia, SERIES_COMBUSTIBLES, ultimosDatos } from "@/lib/rd";
import { EditorNoticias } from "./EditorNoticias";
import { Embebido, Marco, WidgetVacio } from "./Marco";

export interface PropsWidget {
  ficha: FichaWidget;
  tamano: Tamano;
  ahora: Date;
}

// ───────────────────────── El día ─────────────────────────

async function Hoy30({ ficha, ahora }: PropsWidget) {
  const frases = await frasesHoy();
  if (!frases.length) {
    return <WidgetVacio ficha={ficha} motivo="Las frases salen cuando llegan las primeras cifras del día (bolsa, oro, petróleo, dólar)." accion={{ href: "/estado", texto: "Ver el estado de las fuentes" }} />;
  }
  const dia = new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, weekday: "long", day: "numeric", month: "long" }).format(ahora);
  return (
    <Marco ficha={ficha} enlace={{ href: "/news", texto: "Abrir News" }} extra={<span className="dash-fecha">{dia}</span>} pie={<span className="sello">{NOTA_RESUMEN}</span>} clase="dash-w-hoy">
      <ul className="dash-frases">
        {frases.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </Marco>
  );
}

const CIFRAS: Record<string, string> = {
  "cifra-spx": "IDX_SPX",
  "cifra-oro": "ORO",
  "cifra-brent": "BRENT",
  "cifra-dolar-rd": "USDDOP_VENTA",
  "cifra-bono-10a": "UST_10A",
  "cifra-bitcoin": "BTC",
};

function Cifra({ ficha }: PropsWidget) {
  return <MosaicoHoy id={CIFRAS[ficha.id]} como="article" nivel={2} />;
}

async function Alertas({ ficha, ahora }: PropsWidget) {
  let alertas: Awaited<ReturnType<typeof alertasDeHoy>>;
  try {
    alertas = await alertasDeHoy(ahora);
  } catch (e) {
    return <WidgetVacio ficha={ficha} error motivo={(e as Error).message} />;
  }
  if (!alertas.length) {
    return (
      <section className="dash-w dash-w-vacio dash-w-ok" aria-labelledby="w-alertas">
        <div className="dash-w-vacio-cab">
          <h2 className="panel-titulo" id="w-alertas">
            {ficha.titulo}
          </h2>
          <span className="etiqueta ok">Todo tranquilo</span>
        </div>
        <p className="dash-w-motivo">Ningún activo ha cruzado tus umbrales hoy.</p>
        <Link href="/ajustes#t-umbrales" className="boton secundario dash-boton-chico">
          Configurar mis alertas
        </Link>
      </section>
    );
  }
  return (
    <Marco ficha={ficha} enlace={{ href: "/ajustes#t-umbrales", texto: "Umbrales" }} extra={<span className="etiqueta alerta">{alertas.length}</span>}>
      <ul className="dash-lista">
        {alertas.slice(0, 5).map((a) => {
          const obs = a.observaciones;
          const fechaDato = obs?.fecha_dato ?? a.fecha;
          return (
            <li key={a.id} className="dash-alerta">
              <span className="dash-alerta-icono" aria-hidden="true">
                <IconoCampana tam={16} />
              </span>
              <div className="dash-alerta-cuerpo">
                <div className="dash-fila-arriba">
                  <strong>{a.series?.nombre_corto ?? a.serie_id}</strong>
                  <span className="mono dash-cifra-media">{valorConUnidad(a.valor, a.series?.unidad)}</span>
                </div>
                <p className="dash-alerta-msj">{a.mensaje}</p>
                <SelloFuente
                  ahora={ahora}
                  d={{
                    fuente: obs?.fuentes?.nombre ?? "fuente sin registrar",
                    url: obs?.url_dato ?? obs?.fuentes?.url ?? null,
                    fechaDato,
                    verificadoEn: obs?.recogido_en ?? null,
                    desactualizado: a.series
                      ? frescura({ fecha_dato: fechaDato, hora_dato: obs?.hora_dato ?? null }, a.series.max_antiguedad_min, ahora).desactualizado
                      : false,
                    ultimaCorridaFallo: false,
                  }}
                />
              </div>
              <span className="tenue chico mono" title="Hora en que sonó (RD)">
                {horaRD(a.disparada_en)}
              </span>
            </li>
          );
        })}
      </ul>
    </Marco>
  );
}

// ───────────────────────── Tu dinero ─────────────────────────

function Portafolio({ ficha }: PropsWidget) {
  return (
    <Embebido ficha={ficha} enlace={{ href: "/capital", texto: "Abrir Portafolio" }}>
      <ResumenCapital />
    </Embebido>
  );
}

function Presupuesto({ ficha, ahora }: PropsWidget) {
  return (
    <Embebido ficha={ficha} enlace={{ href: "/caja", texto: "Abrir Presupuesto" }}>
      <ResumenCaja ahora={ahora} />
    </Embebido>
  );
}

// ───────────────────────── Noticias ─────────────────────────

const MAX_TITULAR_MIN = 180;

async function MisNoticias({ ficha, tamano, ahora }: PropsWidget) {
  const [lectura, pref] = await Promise.all([
    // Una semana de titulares: «Mis noticias» muestra los últimos que coincidan aunque el filtro sea estrecho.
    leerNoticias(24 * 7, 600).then((d) => ({ d, error: null as string | null })).catch((e: Error) => ({ d: null, error: e.message })),
    leerPreferencia("noticias"),
  ]);
  if (!lectura.d) return <WidgetVacio ficha={ficha} error motivo={lectura.error ?? "No se pudieron leer los titulares."} />;
  const p = normalizarPref(pref.valor);
  const medios = mediosDisponibles(lectura.d.noticias);
  const editor = <EditorNoticias inicial={p} medios={medios.map((m) => m.medio)} vacio={sinFiltros(p)} />;

  if (sinFiltros(p)) {
    return (
      <Marco ficha={ficha} clase="dash-w-guia">
        <div className="dash-guia">
          <p className="dash-guia-titulo">Elige qué noticias quieres ver aquí</p>
          <p className="dash-guia-texto">
            Marca los medios y temas que te importan, o escribe palabras clave. Ej.: <em>petróleo, Banco Central, Popular, Fed</em>.
            Solo verás los titulares guardados que coincidan.
          </p>
          {editor}
        </div>
      </Marco>
    );
  }

  const limite = tamano === 1 ? 5 : tamano === 2 ? 8 : 12;
  const lista = filtrarMisNoticias(lectura.d.noticias, p, limite);
  const fallo = algunaFallo(lectura.d.tareas);
  const resumen = [
    p.medios.length ? (p.medios.length <= 2 ? p.medios.join(" o ") : `${p.medios.length} medios`) : null,
    p.categorias.length
      ? p.categorias.length <= 2
        ? p.categorias.map((c) => ETIQUETA_CATEGORIA[c]).join(" o ")
        : `${p.categorias.length} temas`
      : null,
    p.palabras.length ? `«${p.palabras.slice(0, 3).join("», «")}»${p.palabras.length > 3 ? "…" : ""}` : null,
  ].filter(Boolean).join(" · ");
  const masReciente = lista[0]?.fecha ?? null;

  return (
    <Marco
      ficha={ficha}
      enlace={{ href: "/noticias", texto: "Todos los titulares" }}
      pie={
        masReciente ? (
          <SelloFuente
            ahora={ahora}
            d={{
              fuente: "GDELT y prensa (RSS)",
              url: "https://www.gdeltproject.org/",
              fechaDato: fechaEnZona(masReciente, ZONA_RD),
              verificadoEn: ultimaOk(lectura.d.tareas),
              desactualizado: ahora.getTime() - new Date(masReciente).getTime() > MAX_TITULAR_MIN * 60_000,
              ultimaCorridaFallo: fallo,
            }}
          />
        ) : null
      }
    >
      <div className="dash-filtros">
        <span className="tenue chico">Filtro: {resumen}</span>
        {editor}
      </div>
      {lista.length ? (
        <ol className={`dash-titulares${tamano === 3 ? " dash-titulares-3" : ""}`}>
          {lista.map((n) => (
            <li key={n.id}>
              <div className="dash-titular-meta">
                <EtiquetaCategoria c={n.categoria} />
                <span className="dash-medio">{n.medio}</span>
                <span className="tenue">
                  <Hora iso={n.fecha} ahora={ahora} />
                </span>
              </div>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="dash-titular">
                {n.titular}
                <span className="sr-solo"> (abre {n.medio} en otra pestaña)</span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="dash-w-motivo">
          Ningún titular de los últimos 7 días coincide con tu filtro. Prueba con menos palabras o con más medios.
        </p>
      )}
    </Marco>
  );
}

async function Agenda({ ficha, tamano, ahora }: PropsWidget) {
  let agenda: Awaited<ReturnType<typeof leerAgenda>>;
  try {
    agenda = await leerAgenda();
  } catch (e) {
    return <WidgetVacio ficha={ficha} error motivo={(e as Error).message} />;
  }
  const eventos = proximosEventos(agenda, ahora, 45, tamano === 1 ? 4 : 6);
  if (!eventos.length) {
    return <WidgetVacio ficha={ficha} motivo="No hay reuniones de bancos centrales cargadas para las próximas 6 semanas." accion={{ href: "/noticias", texto: "Ver la agenda completa" }} />;
  }
  return (
    <Marco ficha={ficha} enlace={{ href: "/noticias#titulo-agenda", texto: "Agenda completa" }} pie={<span className="sello">Hora RD · cada evento enlaza a su calendario oficial</span>}>
      <ol className="nt-agenda dash-agenda">
        {eventos.map((e) => (
          <LineaEvento key={e.id} e={e} ahora={ahora} />
        ))}
      </ol>
    </Marco>
  );
}

// ───────────────────────── Mercados y RD ─────────────────────────

async function Curva({ ficha, ahora }: PropsWidget) {
  try {
    const { series, observaciones, fuente, tarea } = await datosTesoro();
    return (
      <Embebido ficha={ficha} enlace={{ href: "/mercado", texto: "Mercados" }}>
        <CurvaTesoro curva={armarCurva(series, observaciones)} tarea={tarea} fuente={fuente} ahora={ahora} />
      </Embebido>
    );
  } catch (e) {
    return <WidgetVacio ficha={ficha} error motivo={(e as Error).message} />;
  }
}

async function leerRD() {
  try {
    return { d: await datosRD(), error: null };
  } catch (e) {
    return { d: null, error: (e as Error).message };
  }
}

function LadoDolar({ rotulo, dato }: { rotulo: string; dato: DatoRD | undefined }) {
  return (
    <div className="dash-kpi">
      <span className="dash-kpi-rotulo">{rotulo}</span>
      {dato ? (
        <>
          <span className="dash-kpi-valor mono">
            <small>RD$</small>
            {cifra(dato.obs.valor, 4)}
          </span>
          <Cambio cambio={dato.obs.cambio} decimales={4} pastilla />
        </>
      ) : (
        <span className="dash-kpi-sin">Sin dato</span>
      )}
    </div>
  );
}

async function Dolar({ ficha, ahora }: PropsWidget) {
  const { d, error } = await leerRD();
  if (!d) return <WidgetVacio ficha={ficha} error motivo={error} />;
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const compra = datos.get("USDDOP_COMPRA");
  const venta = datos.get("USDDOP_VENTA");
  if (!compra && !venta) {
    return <WidgetVacio ficha={ficha} motivo="El Banco Central lo publica cada día hábil; se lee a las 9:00 AM y 4:00 PM (hora RD)." accion={{ href: "/rd", texto: "Ver RD" }} />;
  }
  const brecha = brechaCambiaria(compra?.obs, venta?.obs);
  const serieVenta = historial(d.observaciones, "USDDOP_VENTA", 60);
  const serieCompra = historial(d.observaciones, "USDDOP_COMPRA", 60);
  const principal = venta ?? compra!;
  return (
    <Marco ficha={ficha} enlace={{ href: "/rd", texto: "RD" }} clase="dash-w-dolar" pie={<Sello dato={principal} tarea={tareaDeSerie(d.tareas, principal)} ahora={ahora} />}>
      <div className="dash-kpis">
        <LadoDolar rotulo="Venta" dato={venta} />
        <LadoDolar rotulo="Compra" dato={compra} />
      </div>
      {brecha ? (
        <p className="tenue chico dash-nota" title="Venta menos compra del mismo día">
          Diferencia entre venta y compra: <span className="mono">RD$ {cifra(brecha, 4)}</span>
        </p>
      ) : null}
      {serieVenta.length > 1 ? (
        <GraficoDolar
          venta={serieVenta.map((o) => ({ fecha: o.fecha_dato, valor: o.valor }))}
          compra={serieCompra.map((o) => ({ fecha: o.fecha_dato, valor: o.valor }))}
          etiqueta="Gráfico del dólar de referencia del BCRD (RD$ por US$), compra y venta de las últimas semanas. La tabla está en la pantalla RD."
        />
      ) : null}
    </Marco>
  );
}

async function Combustibles({ ficha, ahora }: PropsWidget) {
  const { d, error } = await leerRD();
  if (!d) return <WidgetVacio ficha={ficha} error motivo={error} />;
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const filas = SERIES_COMBUSTIBLES.map((s) => datos.get(s)).filter((x): x is DatoRD => !!x);
  if (!filas.length) {
    return <WidgetVacio ficha={ficha} motivo="El MICM publica los precios los viernes; se leen el viernes en la noche y el sábado en la mañana." accion={{ href: "/rd", texto: "Ver RD" }} />;
  }
  const semana = filas.map((f) => f.obs.fecha_dato).sort().at(-1)!;
  return (
    <Marco ficha={ficha} enlace={{ href: "/rd", texto: "RD" }} extra={<span className="dash-fecha">{semanaVigencia(semana)}</span>} pie={<SellosAgrupados datos={filas} tareas={d.tareas} ahora={ahora} />}>
      <table className="dash-precios">
        <caption className="sr-solo">Precios oficiales de combustibles de la semana, en RD$ por galón, con el cambio contra la semana anterior</caption>
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
              <th scope="row">{f.serie.nombre}</th>
              <td className="mono dash-precio">{cifra(f.obs.valor, 2)}</td>
              <td className="dash-precio-cambio">
                <Cambio cambio={f.obs.cambio} decimales={2} pastilla />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Marco>
  );
}

/** Igual que la pantalla RD: un rendimiento con más de 10 días se marca «dato viejo». */
const MAX_FONDO_MIN = 14_400;

async function Fondos({ ficha, ahora }: PropsWidget) {
  const { d, error } = await leerRD();
  if (!d) return <WidgetVacio ficha={ficha} error motivo={error} />;
  const a30 = fondosPorSafi(d.fondos)
    .flatMap((g) => g.fondos)
    .filter((f) => f.plazo_dias === 30)
    .sort((a, b) => new Big(b.rendimiento).cmp(new Big(a.rendimiento)) || a.fondo.localeCompare(b.fondo, "es"))
    .slice(0, 5);
  if (!a30.length) {
    return <WidgetVacio ficha={ficha} motivo="Todavía no hay rendimientos a 30 días guardados. Llegan de las administradoras (SAFI) o se cargan a mano con su enlace." accion={{ href: "/carga", texto: "Agregar un rendimiento" }} />;
  }
  return (
    <Marco ficha={ficha} enlace={{ href: "/rd", texto: "Todos" }} pie={<span className="sello">Rendimiento publicado por cada SAFI · base 30 días</span>}>
      <ol className="dash-fondos">
        {a30.map((f, i) => {
          const viejo = frescura({ fecha_dato: f.fecha_corte }, MAX_FONDO_MIN, ahora).desactualizado;
          return (
            <li key={f.id}>
              <span className="dash-puesto mono" aria-hidden="true">
                {i + 1}
              </span>
              <div className="dash-fondo-nombre">
                <strong>{f.fondo}</strong>
                <span className="sello">
                  {f.safi} · {f.moneda === "USD" ? "US$" : "RD$"} · corte {fechaCorta(f.fecha_corte, false)} ·{" "}
                  <a href={f.url_fuente} target="_blank" rel="noopener noreferrer">
                    fuente ↗<span className="sr-solo"> (abre en otra pestaña)</span>
                  </a>
                  {viejo ? <span className="sello-pildora sello-vencido">Dato viejo</span> : null}
                </span>
              </div>
              <span className="mono dash-cifra-media">{cifra(f.rendimiento, 2)}%</span>
            </li>
          );
        })}
      </ol>
    </Marco>
  );
}

export const RENDER: Record<string, (p: PropsWidget) => React.ReactNode> = {
  "hoy-30s": Hoy30,
  "cifra-spx": Cifra,
  "cifra-oro": Cifra,
  "cifra-brent": Cifra,
  "cifra-dolar-rd": Cifra,
  "cifra-bono-10a": Cifra,
  "cifra-bitcoin": Cifra,
  portafolio: Portafolio,
  presupuesto: Presupuesto,
  "mis-noticias": MisNoticias,
  alertas: Alertas,
  "dolar-bcrd": Dolar,
  "curva-tesoro": Curva,
  combustibles: Combustibles,
  fondos: Fondos,
  agenda: Agenda,
};
