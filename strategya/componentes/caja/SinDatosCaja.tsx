import Link from "next/link";

export function SinDatosCaja() {
  return (
    <section className="panel panel-ancho" aria-labelledby="t-sin-caja">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-sin-caja">
          Calendario de Caja
        </h2>
      </div>
      <div className="vacio">
        <p>Todavía no hay datos de caja.</p>
        <ul>
          <li>
            Si usas el artefacto «Calendario de Caja», <Link href="/caja/importar">importa su JSON</Link> y todo queda igual.
          </li>
          <li>
            Si empiezas de cero, pon la fecha de inicio, tu colchón y tus cuentas en <Link href="/caja/ajustes">Ajustes</Link>.
          </li>
        </ul>
      </div>
    </section>
  );
}
