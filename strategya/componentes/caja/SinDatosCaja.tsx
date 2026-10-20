import Link from "next/link";
import { Icono, type NombreIcono } from "./Iconos";

/** Pantalla vacía que guía: qué es, por qué sirve y un botón claro para empezar. */
export function SinDatosCaja({ que = "calendario" }: { que?: "calendario" | "movimientos" | "presupuesto" }) {
  const texto: Record<typeof que, { icono: NombreIcono; titulo: string; por: string }> = {
    calendario: { icono: "calendario", titulo: "Todavía no has creado tu calendario", por: "Con tus cuentas y tus pagos fijos, el calendario te dice cuánto puedes gastar sin quedarte corto." },
    movimientos: { icono: "lista", titulo: "Aquí aparecerá todo lo que anotes", por: "Cada gasto, ingreso o transferencia, agrupado por día, con los totales del mes." },
    presupuesto: { icono: "balanza", titulo: "Aquí verás cuánto llevas gastado de cada cosa", por: "Una barra por categoría (comida, alquiler, luz…) que se llena a medida que gastas." },
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
      <p className="tenue chico">Primero crea tu calendario: son 4 pasos cortos.</p>
      <Link href="/caja" className="boton caja-boton-grande">
        Crear mi calendario
        <Icono n="derecha" tam={18} />
      </Link>
    </section>
  );
}
