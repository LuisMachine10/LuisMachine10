// «Hoy en 30 segundos»: tres o cuatro frases simples con las últimas cifras guardadas. Sin IA: si una
// cifra falta, su frase no sale. Va arriba de todo en News y como widget del Dashboard.
import "@/estilos/mercado.css";
import "@/estilos/dashboard.css";
import { vistaMercado } from "@/componentes/mercado/vista";
import { ZONA_RD } from "@/lib/formato";
import { frasesDelDia, type UltimaCruda } from "@/lib/resumen-dia";

/** Frases del día con las cifras guardadas; lista vacía si no hay cifras o la base no responde. */
export async function frasesHoy(): Promise<string[]> {
  try {
    const v = await vistaMercado();
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD }).format(v.ahora);
    const ultimas = new Map<string, UltimaCruda>(
      v.datos.ultimas.map((o) => [o.serie_id, { serie_id: o.serie_id, valor: o.valor, cambio: o.cambio, cambio_pct: o.cambio_pct, fecha_dato: o.fecha_dato }]),
    );
    return frasesDelDia(ultimas, hoy);
  } catch {
    // Los mosaicos de las cifras ya muestran el error con su motivo.
    return [];
  }
}

export const NOTA_RESUMEN = "Armado solo con las cifras guardadas (cada una con su fuente en su mosaico). No es asesoría de inversión.";

export async function ResumenDia() {
  const frases = await frasesHoy();
  if (!frases.length) return null;
  return (
    <section className="ter-resumen panel-ancho" aria-labelledby="ter-resumen-titulo">
      <h2 id="ter-resumen-titulo">Hoy en 30 segundos</h2>
      <ul className="ter-frases">
        {frases.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <p className="ter-resumen-nota">{NOTA_RESUMEN}</p>
    </section>
  );
}
