"use client";

// Rejilla de widgets del Dashboard con modo de edición: arrastrar para mover (ratón, dedo o teclado,
// con @dnd-kit, MIT), botones ↑/↓, tamaño 1/3 · 2/3 · ancho completo, ocultar y agregar. «Listo»
// guarda en la base (personal.preferencias, clave «dashboard»); «Cancelar» deja todo como estaba.

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  cambiarTamano,
  type Disposicion,
  iguales,
  mover,
  moverA,
  ocultos,
  ponerVisible,
  visibles,
  type WidgetColocado,
} from "@/lib/dashboard/disposicion";
import { type FichaWidget, NOMBRE_GRUPO, type GrupoWidget, type Tamano } from "@/lib/dashboard/widgets";
import { type ClaveTablero, guardarDisposicion, restablecerDisposicion } from "./acciones";

const TAMANOS: { t: Tamano; nombre: string; corto: string }[] = [
  { t: 1, nombre: "Chico (un tercio)", corto: "S" },
  { t: 2, nombre: "Mediano (dos tercios)", corto: "M" },
  { t: 3, nombre: "Grande (ancho completo)", corto: "L" },
];

function Svg({ d, tam = 18 }: { d: string; tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I = {
  editar: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  arrastre: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  arriba: "M12 19V5M6 11l6-6 6 6",
  abajo: "M12 5v14M6 13l6 6 6-6",
  ocultar: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a9.6 9.6 0 0 1-2.4 3.4M6.3 6.3C4.2 7.7 3 9.8 3 12c0 2 4 7 9 7a9.3 9.3 0 0 0 4.2-1",
  mas: "M12 5v14M5 12h14",
  listo: "M5 12l5 5 9-10",
};

interface Props {
  inicial: Disposicion;
  fichas: FichaWidget[];
  /** Widgets ya renderizados en el servidor (solo los visibles al cargar). */
  nodos: Record<string, React.ReactNode>;
  /** Si la disposición guardada no se pudo leer (se usa la de fábrica). */
  aviso: string | null;
  intro: React.ReactNode;
  /** Qué tablero es: el Dashboard (por defecto) o el Resumen del Portafolio. Cada uno guarda su preferencia. */
  clave?: ClaveTablero;
  /** «tu dashboard» / «tu resumen»: para los textos de los botones. */
  nombre?: string;
}

export function Rejilla({ inicial, fichas, nodos, aviso, intro, clave = "dashboard", nombre = "tu dashboard" }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<Disposicion>(inicial);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  // Recién guardado: se sigue mostrando lo guardado hasta que llegue la página nueva del servidor.
  const [recien, setRecien] = useState<Disposicion | null>(null);
  useEffect(() => setRecien(null), [inicial]);
  const porId = useMemo(() => new Map(fichas.map((f) => [f.id, f])), [fichas]);
  const botonEditar = useRef<HTMLButtonElement>(null);

  // Lo que se ve: fuera de edición, siempre lo guardado (llega nuevo con cada actualización).
  const d = editando ? borrador : (recien ?? inicial);
  const lista = visibles(d);
  const cambios = editando && !iguales(borrador, inicial);

  useEffect(() => {
    if (!mensaje?.ok) return;
    const t = window.setTimeout(() => setMensaje(null), 4000);
    return () => window.clearTimeout(t);
  }, [mensaje]);

  function entrar() {
    setBorrador(inicial);
    setMensaje(null);
    setEditando(true);
  }
  function salir() {
    setEditando(false);
    window.setTimeout(() => botonEditar.current?.focus(), 0);
  }
  function listo() {
    if (!cambios) return salir();
    iniciar(async () => {
      const r = await guardarDisposicion(borrador, clave);
      setMensaje({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setRecien(borrador);
        salir();
        router.refresh();
      }
    });
  }
  function deFabrica() {
    iniciar(async () => {
      const r = await restablecerDisposicion(clave);
      setMensaje({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        salir();
        router.refresh();
      }
    });
  }

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function alSoltar(e: DragEndEvent) {
    if (e.over && e.active.id !== e.over.id) setBorrador((b) => moverA(b, String(e.active.id), String(e.over!.id)));
  }

  const anunciar = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Tomaste ${porId.get(String(active.id))?.titulo ?? "el widget"}. Usa las flechas para moverlo y Espacio para soltarlo.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${porId.get(String(active.id))?.titulo} va ahora en el lugar de ${porId.get(String(over.id))?.titulo}.` : undefined,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `Soltaste ${porId.get(String(active.id))?.titulo}.` : `${porId.get(String(active.id))?.titulo} quedó donde estaba.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Cancelado: ${porId.get(String(active.id))?.titulo} quedó donde estaba.`,
  };

  const items = lista.map((w, i) => {
    const ficha = porId.get(w.id);
    if (!ficha) return null;
    const contenido = nodos[w.id] ?? (
      <section className="dash-w dash-w-vacio dash-w-pendiente" aria-label={ficha.titulo}>
        <div className="dash-w-vacio-cab">
          <h2 className="panel-titulo">{ficha.titulo}</h2>
          <span className="etiqueta neutra">Nuevo</span>
        </div>
        <p className="dash-w-motivo">{ficha.que} Se llena al pulsar «Listo».</p>
      </section>
    );
    return editando ? (
      <ItemEditable
        key={w.id}
        w={w}
        ficha={ficha}
        primero={i === 0}
        ultimo={i === lista.length - 1}
        onMover={(p) => setBorrador((b) => mover(b, w.id, p))}
        onTamano={(t) => setBorrador((b) => cambiarTamano(b, w.id, t))}
        onOcultar={() => setBorrador((b) => ponerVisible(b, w.id, false))}
      >
        {contenido}
      </ItemEditable>
    ) : (
      <li key={w.id} className={`dash-item t-${w.tamano}`}>
        {contenido}
      </li>
    );
  });

  return (
    <>
      <div className="dash-cabecera">
        {intro}
        {!editando ? (
          <div className="dash-cabecera-acciones">
            <button ref={botonEditar} type="button" className="boton dash-boton-grande" onClick={entrar}>
              <Svg d={I.editar} />
              Editar {nombre.replace(/^tu /, "mi ")}
            </button>
          </div>
        ) : null}
      </div>

      {aviso ? (
        <p className="dash-aviso" role="status">
          No se pudo leer tu disposición guardada ({aviso}). Te mostramos la de fábrica; tus cambios se guardan igual al pulsar «Listo».
        </p>
      ) : null}
      {mensaje ? (
        <p className={mensaje.ok ? "dash-ok" : "dash-error"} role={mensaje.ok ? "status" : "alert"}>
          {mensaje.texto}
        </p>
      ) : null}

      {editando ? (
        <div className="dash-barra-edicion" role="region" aria-label={`Edición de ${nombre}`}>
          <div className="dash-barra-texto">
            <strong>Editando {nombre}</strong>
            <span>Arrastra cada tarjeta por el asa ⋮⋮ (o usa ↑ ↓), elige su tamaño y oculta lo que no uses.</span>
          </div>
          <div className="dash-barra-botones">
            <button type="button" className="boton secundario" onClick={deFabrica} disabled={guardando}>
              Volver al de fábrica
            </button>
            <button type="button" className="boton secundario" onClick={salir} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="boton dash-boton-grande" onClick={listo} disabled={guardando}>
              <Svg d={I.listo} />
              {guardando ? "Guardando…" : "Listo"}
            </button>
          </div>
        </div>
      ) : null}

      {lista.length === 0 ? (
        <div className="dash-vacio-total">
          <p className="dash-guia-titulo">{nombre.charAt(0).toUpperCase() + nombre.slice(1)} está vacío</p>
          <p className="dash-guia-texto">Agrega las tarjetas que quieras ver con «Agregar tarjetas».</p>
          {!editando ? (
            <button type="button" className="boton dash-boton-grande" onClick={entrar}>
              Agregar tarjetas
            </button>
          ) : null}
        </div>
      ) : editando ? (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar} accessibility={{ announcements: anunciar }}>
          <SortableContext items={lista.map((w) => w.id)} strategy={rectSortingStrategy}>
            <ol className="dash-rejilla editando" aria-label={`Tarjetas de ${nombre}, en orden`}>
              {items}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol className="dash-rejilla" aria-label={`Tarjetas de ${nombre}`}>
          {items}
        </ol>
      )}

      {editando ? <Ocultos d={borrador} porId={porId} onMostrar={(id) => setBorrador((b) => ponerVisible(b, id, true))} /> : null}
    </>
  );
}

function ItemEditable({
  w,
  ficha,
  primero,
  ultimo,
  onMover,
  onTamano,
  onOcultar,
  children,
}: {
  w: WidgetColocado;
  ficha: FichaWidget;
  primero: boolean;
  ultimo: boolean;
  onMover: (pasos: number) => void;
  onTamano: (t: Tamano) => void;
  onOcultar: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const estilo: React.CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={estilo} className={`dash-item t-${w.tamano}${isDragging ? " arrastrando" : ""}`}>
      <div className="dash-herramientas" role="group" aria-label={`Ajustes de ${ficha.titulo}`}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="dash-asa"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${ficha.titulo}. Pulsa Espacio y usa las flechas.`}
          title="Arrastra para mover"
        >
          <Svg d={I.arrastre} />
        </button>
        <span className="dash-herr-nombre">{ficha.titulo}</span>
        <button type="button" className="dash-icono" onClick={() => onMover(-1)} disabled={primero} aria-label={`Subir ${ficha.titulo}`} title="Subir">
          <Svg d={I.arriba} tam={16} />
        </button>
        <button type="button" className="dash-icono" onClick={() => onMover(1)} disabled={ultimo} aria-label={`Bajar ${ficha.titulo}`} title="Bajar">
          <Svg d={I.abajo} tam={16} />
        </button>
        <span className="dash-tamanos" role="group" aria-label="Tamaño">
          {TAMANOS.map((t) => (
            <button
              key={t.t}
              type="button"
              aria-pressed={w.tamano === t.t}
              aria-label={`Tamaño ${t.nombre}`}
              title={t.nombre}
              onClick={() => onTamano(t.t)}
            >
              {t.corto}
            </button>
          ))}
        </span>
        <button type="button" className="dash-icono" onClick={onOcultar} aria-label={`Ocultar ${ficha.titulo}`} title="Ocultar">
          <Svg d={I.ocultar} tam={16} />
        </button>
      </div>
      <div className="dash-item-contenido" inert>
        {children}
      </div>
    </li>
  );
}

function Ocultos({ d, porId, onMostrar }: { d: Disposicion; porId: Map<string, FichaWidget>; onMostrar: (id: string) => void }) {
  const lista = ocultos(d)
    .map((w) => porId.get(w.id))
    .filter((f): f is FichaWidget => !!f);
  const grupos = new Map<GrupoWidget, FichaWidget[]>();
  for (const f of lista) grupos.set(f.grupo, [...(grupos.get(f.grupo) ?? []), f]);
  return (
    <section className="dash-ocultos" aria-labelledby="dash-ocultos-titulo">
      <h2 id="dash-ocultos-titulo" className="panel-titulo">
        Agregar tarjetas
      </h2>
      {lista.length ? (
        <>
          <p className="tenue chico">Estas tarjetas están ocultas. Pulsa «Agregar» y quedan al final; luego muévelas donde quieras.</p>
          {[...grupos.entries()].map(([g, fs]) => (
            <div key={g} className="dash-ocultos-grupo">
              <h3>{NOMBRE_GRUPO[g]}</h3>
              <ul>
                {fs.map((f) => (
                  <li key={f.id}>
                    <span>
                      <strong>{f.titulo}</strong>
                      <small>{f.que}</small>
                    </span>
                    <button type="button" className="boton secundario dash-boton-chico" onClick={() => onMostrar(f.id)} aria-label={`Agregar ${f.titulo}`}>
                      <Svg d={I.mas} tam={16} />
                      Agregar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : (
        <p className="tenue chico">Ya tienes todas las tarjetas a la vista. Para quitar una, pulsa su botón de ocultar.</p>
      )}
    </section>
  );
}
