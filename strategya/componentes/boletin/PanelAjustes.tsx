// Ajustes · «Boletín por correo»: qué ediciones salen y si llevan «Tu dinero» (personal.preferencias, «boletin»).
import "@/estilos/boletin.css";
import Link from "next/link";
import { normalizarPrefBoletin } from "@/lib/boletin/preferencias";
import { leerPreferencia } from "@/lib/dashboard/datos";
import { AjustesBoletin } from "./Controles";

export async function PanelAjustesBoletin() {
  const pref = await leerPreferencia("boletin");
  return (
    <section className="panel panel-ancho" aria-labelledby="t-boletin-titulo" id="t-boletin">
      <div className="panel-cabecera">
        <h2 className="panel-titulo">
          <span id="t-boletin-titulo">Boletín por correo</span>
        </h2>
        <Link href="/boletin" className="chico">
          Ver las ediciones →
        </Link>
      </div>
      <div className="panel-cuerpo">
        <p className="chico tenue" style={{ marginTop: 0 }}>
          Marca los boletines que quieres recibir. Se arman solos con los datos de Strategya (sin inteligencia artificial) y llegan a tu correo.
        </p>
        {pref.error ? (
          <p className="chico baja" role="alert">
            No se pudieron leer tus ajustes ({pref.error}); se muestran los de fábrica.
          </p>
        ) : null}
        <AjustesBoletin inicial={normalizarPrefBoletin(pref.valor)} />
      </div>
    </section>
  );
}
