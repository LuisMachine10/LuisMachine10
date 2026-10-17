import "server-only";
import { historias, type Historias } from "@/componentes/terminal/datos";

const VACIAS: Historias = { intradia: [], diarias: [] };

/** Historias para minigráficos; si no se pueden leer, los paneles siguen sin gráfico (nunca se inventa). */
export async function historiasSeguras(): Promise<Historias> {
  try {
    return await historias();
  } catch {
    return VACIAS;
  }
}
