import Link from "next/link";
import { Icono, type NombreIcono } from "./Iconos";

/** Pantalla vacía que guía: qué es, por qué sirve y un botón claro para empezar. */
export function SinDatosCaja({ que = "calendario" }: { que?: "calendario" | "movimientos" | "resultados" }) {
  const texto: Record<typeof que, { icono: NombreIcono; titulo: string; por: string }> = {
    calendario: { icono: "calendario", titulo: "Todavía no has creado tu presupuesto", por: "Con tus ingresos, tus gastos y tus cuentas, el calendario te dice cuánto puedes gastar sin quedarte corto." },
    movimientos: { icono: "lista", titulo: "Aquí aparecerá todo lo que anotes", por: "Cada ingreso, gasto o movimiento entre tus cuentas, agrupado por día, con los totales del mes." },
    resultados: { icono: "balanza", titulo: "Aquí verás tu estado de resultados", por: "Ingresos, costos y gastos del mes: lo que planificaste contra lo que de verdad pasó, hasta tu utilidad neta." },
  };
  const t = texto[que];
  return (
    <section className="panel panel-ancho caja-vacia" aria-labelledby="t-sin-caja">
      <span className="caja-bienvenida-icono" aria-hidden="true">
        <Icono n={t.icono} tam={26} />
      </span>
      <h2 className="panel-titulo" id="t-sin-caja">
        {t.titulo}
      </h2>
      <p className="tenue">{t.por}</p>
      <p className="tenue chico">Primero crea tu presupuesto: son 4 pasos cortos.</p>
      <Link href="/caja" className="boton caja-boton-grande">
        Crear mi presupuesto
        <Icono n="derecha" tam={18} />
      </Link>
    </section>
  );
}
