"use client";
import "@/estilos/ayuda.css";
// Bienvenida de 3 pasos la primera vez que se abre Strategya (o cuando se pide desde /ayuda).
// Solo recuerda en este navegador que ya se vio; no guarda nada en la base.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Monograma } from "@/componentes/marca/Monograma";
import { IlustracionCifra, IlustracionDashboard, IlustracionDinero } from "./Ilustraciones";

const CLAVE = "strategya-bienvenida-vista";
export const EVENTO_ABRIR = "strategya:abrir-bienvenida";

const PASOS = [
  {
    corto: "Tu Dashboard",
    titulo: "Tu Dashboard, a tu manera",
    texto:
      "En «Dashboard» ves en tarjetas lo que tú elijas: las cifras del día, tus noticias, tu presupuesto y tu portafolio. Pulsa «Editar mi dashboard» para moverlas, cambiarles el tamaño u ocultarlas. En «News» tienes el día completo en una sola página.",
    ilustracion: <IlustracionDashboard />,
  },
  {
    corto: "Las cifras",
    titulo: "Cada cifra se lee igual",
    texto:
      "La cifra grande es el último precio. La pastilla dice cuánto se movió: verde sube, rojo baja. Debajo, en pequeño, la fuente y de qué día es. Si dice «dato viejo» o «sin dato», la fuente no ha publicado: Strategya nunca inventa una cifra.",
    ilustracion: <IlustracionCifra />,
  },
  {
    corto: "Tu dinero",
    titulo: "Anota tu dinero",
    texto:
      "En «Portafolio» y «Presupuesto» anotas tus inversiones, cuentas, ingresos y pagos (basta un nombre que reconozcas, nunca números de cuenta). Solo tú los ves. Todo lo demás (mercados, RD, noticias) se actualiza solo.",
    ilustracion: <IlustracionDinero />,
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
    <dialog ref={ref} className="bienvenida" aria-labelledby="bienvenida-titulo" aria-describedby="bienvenida-texto" onClose={marcar}>
      <div className="bv-escena">
        <div className="bv-escena-cab">
          <span className="bv-marca">
            <Monograma tamano={26} />
            <span className="marca-nombre">Strategya</span>
          </span>
          <span className="bv-contador" aria-hidden="true">
            <strong>{String(paso + 1).padStart(2, "0")}</strong> / {String(PASOS.length).padStart(2, "0")}
          </span>
        </div>
        {/* key: al cambiar de paso, la ilustración entra de nuevo con su animación */}
        <div className="bv-escena-dibujo" key={paso}>
          {p.ilustracion}
        </div>
      </div>
      <div className="bv-contenido">
        <p className="bienvenida-intro">
          <span>Bienvenido a Strategya</span> Tu resumen financiero del día, en un solo lugar.
        </p>
        <div className="bienvenida-cuerpo" key={paso}>
          <h2 id="bienvenida-titulo">{p.titulo}</h2>
          <p id="bienvenida-texto">{p.texto}</p>
        </div>
        <div className="bv-progreso">
          <span className="bienvenida-paso" aria-live="polite">
            Paso {paso + 1} de {PASOS.length}
          </span>
          <ol aria-hidden="true">
            {PASOS.map((x, i) => (
              <li key={x.corto} className={i < paso ? "hecho" : i === paso ? "activo" : undefined}>
                <span className="bv-barra" />
                <span className="bv-rotulo">{x.corto}</span>
              </li>
            ))}
          </ol>
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
      </div>
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
