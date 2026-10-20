import { redirect } from "next/navigation";

// Importar vive ahora en Ajustes → «Avanzado: importar desde el artefacto anterior». La ruta vieja
// sigue funcionando y lleva allí.
export default function PaginaImportar() {
  redirect("/caja/ajustes#avanzado");
}
