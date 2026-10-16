// Avisos del estado de la IA: no activa (sin clave o sin corridas) o tope mensual alcanzado.
// La terminal sigue mostrando datos y titulares; solo deja de haber texto nuevo de la IA.

import "@/estilos/alertas-ia.css";
import type { EstadoIA } from "@/lib/alertas-ia";
import { cifra } from "@/lib/formato";

export function AvisoIA({ estado, gasto }: { estado: EstadoIA; gasto?: string }) {
  if (!estado.activa) {
    return (
      <p className="aviso-ia chico">
        {estado.motivo === "sin_clave"
          ? "El resumen con IA no está activo: falta ANTHROPIC_API_KEY en los secretos de Supabase. Se muestran los titulares guardados, sin texto redactado."
          : "El resumen con IA no está activo todavía (la tarea no ha corrido). Se muestran los titulares guardados, sin texto redactado."}
      </p>
    );
  }
  if (estado.topeAlcanzado) {
    return (
      <p className="aviso-ia tope chico" role="status">
        <strong>Tope de IA alcanzado</strong>
        {gasto && estado.tope ? ` (US$${cifra(gasto, 2)} de US$${cifra(estado.tope, 2)} este mes)` : ""}: no se redacta texto nuevo hasta el
        próximo mes. Los datos y los titulares siguen al día.
      </p>
    );
  }
  return null;
}
