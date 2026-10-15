"use client";

// Selector de mes. Funciona sin JavaScript (formulario GET con botón) y, con JavaScript, cambia al elegir.

import { usePathname, useRouter } from "next/navigation";

export function SelectorMes({ mes, opciones }: { mes: string; opciones: { valor: string; etiqueta: string }[] }) {
  const router = useRouter();
  const ruta = usePathname();
  return (
    <form className="cap-mes" method="get" action={ruta}>
      <label className="sr-solo" htmlFor="cap-mes">
        Mes
      </label>
      <select id="cap-mes" name="mes" defaultValue={mes} onChange={(e) => router.push(`${ruta}?mes=${e.target.value}`)}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="boton-texto">
          Ver
        </button>
      </noscript>
    </form>
  );
}
