// Piezas de la pantalla Estado: el resumen de arriba, una familia de lecturas y el detalle técnico.

import "@/componentes/estado/estado.css";
import type { FilaEstadoTarea } from "@/lib/datos";
import { fechaHoraRD, hace } from "@/lib/formato";
import { DESCRIPCION_FAMILIA, describirTarea, type Familia, FAMILIAS, salud, type Salud } from "./tareas";

export interface Lectura {
  t: FilaEstadoTarea;
  nombre: string;
  familia: Familia;
  salud: Salud;
  texto: string;
}

export function armarLecturas(tareas: FilaEstadoTarea[], ahora: Date): Lectura[] {
  return tareas.map((t) => {
    const d = describirTarea(t.tarea);
    const s = salud(t.estado, t.inicio, ahora);
    return { t, nombre: d.nombre, familia: d.familia, salud: s.salud, texto: s.texto };
  });
}

export function porFamilia(lecturas: Lectura[]): Array<{ familia: Familia; lecturas: Lectura[] }> {
  const orden: Record<Salud, number> = { error: 0, parcial: 1, corriendo: 2, otro: 3, ok: 4 };
  return FAMILIAS.map((familia) => ({
    familia,
    lecturas: lecturas
      .filter((l) => l.familia === familia)
      .sort((a, b) => orden[a.salud] - orden[b.salud] || a.nombre.localeCompare(b.nombre, "es")),
  })).filter((g) => g.lecturas.length > 0);
}

function contar(lecturas: Lectura[]) {
  return {
    ok: lecturas.filter((l) => l.salud === "ok").length,
    parcial: lecturas.filter((l) => l.salud === "parcial").length,
    error: lecturas.filter((l) => l.salud === "error").length,
    otras: lecturas.filter((l) => l.salud === "corriendo" || l.salud === "otro").length,
  };
}

export function Punto({ s }: { s: Salud }) {
  return <span className={`es-punto es-${s}`} aria-hidden="true" />;
}

/** «22 de 26 lecturas al día», con la barra de colores y la leyenda (el color nunca va solo). */
export function ResumenLecturas({ lecturas }: { lecturas: Lectura[] }) {
  const c = contar(lecturas);
  const total = lecturas.length;
  const tramo = (n: number) => `${(n / Math.max(total, 1)) * 100}%`;
  const mensaje =
    c.error === 0 && c.parcial === 0
      ? "Todo llegó bien. Las cifras de la terminal están al día."
      : c.error > 0
        ? "Algunas lecturas fallaron: sus cifras pueden estar viejas y la pantalla las marca como «dato viejo»."
        : "Algunas lecturas llegaron a medias: faltan datos de una parte de la fuente.";
  return (
    <section className="panel panel-ancho es-resumen" aria-labelledby="t-resumen-estado">
      <div className="panel-cuerpo">
        <h2 className="sr-solo" id="t-resumen-estado">
          Resumen
        </h2>
        <p className="es-resumen-cifra">
          <span className="cifra-grande">
            {c.ok} de {total}
          </span>{" "}
          <span className="es-resumen-rotulo">lecturas al día</span>
        </p>
        <p className="es-resumen-mensaje">{mensaje}</p>
        <div className="es-barra" role="img" aria-label={`${c.ok} al día, ${c.parcial} a medias, ${c.error} fallaron, ${c.otras} en curso u otro estado`}>
          {c.ok ? <span className="es-ok" style={{ width: tramo(c.ok) }} /> : null}
          {c.parcial ? <span className="es-parcial" style={{ width: tramo(c.parcial) }} /> : null}
          {c.error ? <span className="es-error" style={{ width: tramo(c.error) }} /> : null}
          {c.otras ? <span className="es-otro" style={{ width: tramo(c.otras) }} /> : null}
        </div>
        <ul className="es-leyenda">
          <li>
            <Punto s="ok" /> <strong className="mono">{c.ok}</strong> al día
          </li>
          <li>
            <Punto s="parcial" /> <strong className="mono">{c.parcial}</strong> a medias
          </li>
          <li>
            <Punto s="error" /> <strong className="mono">{c.error}</strong> fallaron
          </li>
          {c.otras ? (
            <li>
              <Punto s="corriendo" /> <strong className="mono">{c.otras}</strong> leyendo ahora
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

function FilaLectura({ l, ahora }: { l: Lectura; ahora: Date }) {
  const { t } = l;
  const recibidas = typeof t.detalle?.recibidas === "number" ? t.detalle.recibidas : null;
  const errores = Number(t.errores_24h);
  const ultimaBuenaDistinta = t.ultima_ok && t.ultima_ok !== t.inicio && l.salud !== "ok";
  return (
    <li className={`es-fila es-fila-${l.salud}`}>
      <Punto s={l.salud} />
      <div className="es-fila-principal">
        <div className="es-fila-arriba">
          <span className="es-nombre">{l.nombre}</span>
          <span className={`es-estado es-${l.salud}`}>{l.texto}</span>
        </div>
        <div className="es-fila-meta">
          <span title={`Última corrida: ${fechaHoraRD(t.inicio)} (hora RD)`}>{hace(t.inicio, ahora)}</span>
          {l.salud !== "ok" ? (
            t.ultima_ok ? (
              ultimaBuenaDistinta ? (
                <span title={fechaHoraRD(t.ultima_ok)}>última buena {hace(t.ultima_ok, ahora)}</span>
              ) : null
            ) : (
              <span>sin lectura completa todavía</span>
            )
          ) : null}
          <span title="Filas que trajo la fuente / filas nuevas o corregidas en la base">
            {recibidas !== null ? (
              <>
                trajo <span className="mono">{recibidas}</span> · guardó <span className="mono">{t.filas}</span>
              </>
            ) : (
              <>
                guardó <span className="mono">{t.filas}</span>
              </>
            )}
          </span>
          {errores > 0 ? (
            <span className="baja" title="Corridas con error en las últimas 24 horas">
              <span className="mono">{errores}</span> {errores === 1 ? "error" : "errores"} en 24 h
            </span>
          ) : null}
          <span className="es-id mono" title="Nombre técnico de la tarea">
            {t.tarea}
          </span>
        </div>
        {t.error ? <Motivo texto={t.error} /> : null}
      </div>
    </li>
  );
}

const MOTIVO_CORTO = 150;

/** El motivo de una lectura con problema. Si es largo (URLs, varias fuentes), se ve el comienzo y se despliega el resto. */
export function Motivo({ texto }: { texto: string }) {
  if (texto.length <= MOTIVO_CORTO) return <p className="es-motivo">{texto}</p>;
  return (
    <details className="es-motivo es-motivo-largo">
      <summary>
        <span className="es-motivo-inicio">{texto.slice(0, MOTIVO_CORTO).trimEnd()}…</span> <span className="es-motivo-ver">Ver todo</span>
      </summary>
      <p>{texto}</p>
    </details>
  );
}

export function FamiliaLecturas({ familia, lecturas, ahora }: { familia: Familia; lecturas: Lectura[]; ahora: Date }) {
  const c = contar(lecturas);
  const id = `fam-${familia.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className="panel es-familia" aria-labelledby={id}>
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id={id}>
          {familia}
        </h2>
        <span className={`etiqueta ${c.error ? "error" : c.parcial ? "alerta" : "ok"}`}>
          {c.ok} de {lecturas.length} al día
        </span>
        <p className="es-familia-desc">{DESCRIPCION_FAMILIA[familia]}</p>
      </div>
      <ul className="es-lista">
        {lecturas.map((l) => (
          <FilaLectura key={l.t.tarea} l={l} ahora={ahora} />
        ))}
      </ul>
    </section>
  );
}
