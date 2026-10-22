"use client";
import "@/estilos/ayuda.css";
// Bienvenida de 3 pasos la primera vez que se abre Strategya (o cuando se pide desde /ayuda).
// Solo recuerda en este navegador que ya se vio; no guarda nada en la base.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const CLAVE = "strategya-bienvenida-vista";
export const EVENTO_ABRIR = "strategya:abrir-bienvenida";

const PASOS = [
  {
    titulo: "Tu Dashboard, a tu manera",
    texto:
      "En «Dashboard» ves en tarjetas lo que tú elijas: las cifras del día, tus noticias, tu presupuesto y tu portafolio. Pulsa «Editar mi dashboard» para moverlas, cambiarles el tamaño u ocultarlas. En «News» tienes el día completo en una sola página.",
    icono: <path d="M3 17l5-6 4 3 6-8 3 4M3 21h18" />,
  },
  {
    titulo: "Cada cifra se lee igual",
    texto:
      "La cifra grande es el último precio. La pastilla dice cuánto se movió: verde sube, rojo baja. Debajo, en pequeño, la fuente y de qué día es. Si dice «dato viejo» o «sin dato», la fuente no ha publicado: Strategya nunca inventa una cifra.",
    icono: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8h.01M11 12h1v5h1" />,
  },
  {
    titulo: "Anota tu dinero",
    texto:
      "En «Portafolio» y «Presupuesto» anotas tus inversiones, cuentas, ingresos y pagos (basta un nombre que reconozcas, nunca números de cuenta). Solo tú los ves. Todo lo demás (mercados, RD, noticias) se actualiza solo.",
    icono: <path d="M3 7h18v13H3zM3 7l2-3h14l2 3M8 12h8M8 16h5" />,
  },
];

function leer(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return true; // sin almacenamiento (modo privado): no insistir en cada página
  }
}
function marcar() {
  try {
    window.localStorage.setItem(CLAVE, "1");
  } catch {
    // nada que hacer
  }
}

export function Bienvenida() {
  const ref = useRef<HTMLDialogElement>(null);
  const [paso, setPaso] = useState(0);

  const abrir = useCallback(() => {
    setPaso(0);
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const cerrar = useCallback(() => {
    marcar();
    ref.current?.close();
  }, []);

  useEffect(() => {
    if (!leer()) abrir();
    const alPedir = () => abrir();
    window.addEventListener(EVENTO_ABRIR, alPedir);
    return () => window.removeEventListener(EVENTO_ABRIR, alPedir);
  }, [abrir]);

  const p = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;
  return (
    <dialog ref={ref} className="bienvenida" aria-labelledby="bienvenida-titulo" onClose={marcar}>
      <div className="bienvenida-cab">
        <span className="marca-logo" aria-hidden="true">
          S
        </span>
        <span className="bienvenida-paso">
          Paso {paso + 1} de {PASOS.length}
        </span>
      </div>
      <p className="bienvenida-intro">Bienvenido a Strategya: tu resumen financiero del día, en un solo lugar.</p>
      <div className="bienvenida-cuerpo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {p.icono}
        </svg>
        <h2 id="bienvenida-titulo">{p.titulo}</h2>
        <p>{p.texto}</p>
      </div>
      <div className="bienvenida-puntos" aria-hidden="true">
        {PASOS.map((_, i) => (
          <span key={i} className={i === paso ? "activo" : undefined} />
        ))}
      </div>
      <div className="bienvenida-acciones">
        <button type="button" className="boton-enlace" onClick={cerrar}>
          {ultimo ? "Cerrar" : "Saltar"}
        </button>
        <div>
          {paso > 0 ? (
            <button type="button" className="boton secundario" onClick={() => setPaso(paso - 1)}>
              Atrás
            </button>
          ) : null}
          {ultimo ? (
            <button type="button" className="boton" onClick={cerrar}>
              Empezar
            </button>
          ) : (
            <button type="button" className="boton" onClick={() => setPaso(paso + 1)}>
              Siguiente
            </button>
          )}
        </div>
      </div>
      <p className="bienvenida-pie">
        Puedes volver a verla cuando quieras en la <Link href="/ayuda" onClick={cerrar}>Guía de uso</Link> (Más → Ayuda).
      </p>
    </dialog>
  );
}

/** Botón para /ayuda: vuelve a mostrar la bienvenida. */
export function BotonVerBienvenida() {
  return (
    <button type="button" className="boton secundario" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}>
      Ver la bienvenida otra vez
    </button>
  );
}
