// «Hoy en 30 segundos»: tres o cuatro frases simples con las últimas cifras guardadas. Sin IA: si una
// cifra falta, su frase no sale. Va arriba de todo en la terminal para que cualquiera entienda el día.
import "@/estilos/mercado.css";
import { vistaMercado } from "@/componentes/mercado/vista";
import { ZONA_RD } from "@/lib/formato";
import { frasesDelDia, type UltimaCruda } from "@/lib/resumen-dia";

export async function ResumenDia() {
  let frases: string[] = [];
  try {
    const v = await vistaMercado();
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD }).format(v.ahora);
    const ultimas = new Map<string, UltimaCruda>(
      v.datos.ultimas.map((o) => [o.serie_id, { serie_id: o.serie_id, valor: o.valor, cambio: o.cambio, cambio_pct: o.cambio_pct, fecha_dato: o.fecha_dato }]),
    );
    frases = frasesDelDia(ultimas, hoy);
  } catch {
    // Los mosaicos de abajo ya muestran el error con su motivo.
  }
  if (!frases.length) return null;
  return (
    <section className="ter-resumen panel-ancho" aria-labelledby="ter-resumen-titulo">
      <h2 id="ter-resumen-titulo">Hoy en 30 segundos</h2>
      <ul>
        {frases.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <p className="ter-resumen-nota">
        Armado solo con las cifras guardadas (las de abajo, con su fuente). No es asesoría de inversión.
      </p>
    </section>
  );
}
