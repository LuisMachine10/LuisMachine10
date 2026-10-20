// Debajo de cada cifra: de dónde sale, de qué fecha es, cuándo se verificó y si está vencida.
// Discreto a la vista (texto pequeño y tenue), completo para lectores de pantalla y en el title.

import "@/estilos/mercado.css";
import { fechaCorta, fechaHoraRD, hace } from "@/lib/formato";

export interface DatosSello {
  fuente: string;
  url: string | null;
  fechaDato: string;
  verificadoEn: string | null;
  desactualizado: boolean;
  ultimaCorridaFallo: boolean;
}

/** Año visible solo si el dato no es del año en curso (hora RD). */
function fechaVisible(fechaDato: string, ahora: Date): string {
  const anioActual = new Intl.DateTimeFormat("en", { timeZone: "America/Santo_Domingo", year: "numeric" }).format(ahora);
  return fechaCorta(fechaDato, !fechaDato.startsWith(anioActual));
}

export function SelloFuente({ d, ahora }: { d: DatosSello; ahora: Date }) {
  const fecha = fechaVisible(d.fechaDato, ahora);
  return (
    <div className="sello sello-fino">
      <span className="sello-fuente" title={d.fuente}>
        {d.url ? (
          <a href={d.url} target="_blank" rel="noopener noreferrer">
            {d.fuente}
            <span aria-hidden="true"> ↗</span>
            <span className="sr-solo"> (abre la fuente en otra pestaña)</span>
          </a>
        ) : (
          d.fuente
        )}
      </span>
      <span className="sello-cuando">
        <span title={`Dato del ${fechaCorta(d.fechaDato)}`}>
          <span className="sr-solo">dato del </span>
          {fecha}
        </span>
        {d.verificadoEn ? (
          <span title={`Verificado ${fechaHoraRD(d.verificadoEn)} (hora RD)`}>
            <span className="sr-solo">verificado </span>
            {hace(d.verificadoEn, ahora)}
          </span>
        ) : null}
        {d.desactualizado ? (
          <span className="sello-pildora sello-vencido" title="La fuente no ha publicado en su horario normal: es la última cifra buena, con su fecha">
            Dato viejo
          </span>
        ) : null}
        {d.ultimaCorridaFallo ? (
          <span className="sello-pildora sello-fallo" title="La última lectura automática de esta fuente falló (ver Estado)">
            <span aria-hidden="true">!</span> última lectura falló
          </span>
        ) : null}
      </span>
    </div>
  );
}
