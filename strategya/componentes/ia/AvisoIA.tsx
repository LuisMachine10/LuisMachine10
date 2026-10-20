// Avisos del estado de la IA: no activa (sin clave o sin corridas) o tope mensual alcanzado.
// La terminal sigue mostrando datos y titulares; solo deja de haber texto nuevo de la IA.

import "@/estilos/alertas-ia.css";
import type { EstadoIA } from "@/lib/alertas-ia";
import { cifra } from "@/lib/formato";

export function AvisoIA({ estado, gasto }: { estado: EstadoIA; gasto?: string }) {
  if (!estado.activa) {
    return (
      <div className="aviso-ia">
        <p>
          <strong>El resumen con IA está apagado.</strong> Mientras tanto ves los titulares tal como llegaron, sin texto redactado.
        </p>
        <details className="aj-detalle">
          <summary className="chico">¿Por qué está apagado?</summary>
          <p className="chico tenue">
            {estado.motivo === "sin_clave"
              ? "Falta ANTHROPIC_API_KEY en los secretos de Supabase."
              : "La tarea de IA todavía no ha corrido ninguna vez."}
          </p>
        </details>
      </div>
    );
  }
  if (estado.topeAlcanzado) {
    return (
      <p className="aviso-ia tope" role="status">
        <strong>Se llegó al tope de gasto de IA del mes</strong>
        {gasto && estado.tope ? (
          <span className="mono">
            {" "}
            (US${cifra(gasto, 2)} de US${cifra(estado.tope, 2)})
          </span>
        ) : null}
        . No se redacta texto nuevo hasta el próximo mes; los datos y los titulares siguen al día.
      </p>
    );
  }
  return null;
}
