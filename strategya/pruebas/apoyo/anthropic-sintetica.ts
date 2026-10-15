// SINTÉTICA: reemplazar por real. Respuesta mínima de POST https://api.anthropic.com/v1/messages según la
// documentación oficial (https://docs.claude.com/en/api/messages): content[] con un bloque thinking vacío
// (display omitido, el comportamiento por defecto en los modelos 5.5) y un bloque text, stop_reason y usage.
// La sonda no puede traer la real (exige clave): ver sondas/lotes/24-anthropic-resend.txt.

import type { Respuesta } from "../../supabase/functions/_shared/http.ts";

export function respuestaSintetica(texto: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "msg_sintetico",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "firma-sintetica" },
      { type: "text", text: texto },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...extra,
  });
}

export function respuestaHttp(url: string, texto: string): Respuesta {
  return { url, status: 200, tipo: "application/json", texto, intentos: 1 };
}
