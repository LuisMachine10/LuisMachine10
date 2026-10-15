// Debajo de cada cifra: de dónde sale, de qué fecha es, cuándo se verificó y si está vencida.

import { fechaCorta, fechaHoraRD, hace } from "@/lib/formato";

export interface DatosSello {
  fuente: string;
  url: string | null;
  fechaDato: string;
  verificadoEn: string | null;
  desactualizado: boolean;
  ultimaCorridaFallo: boolean;
}

export function SelloFuente({ d, ahora }: { d: DatosSello; ahora: Date }) {
  return (
    <div className="sello">
      <span>
        {d.url ? (
          <a href={d.url} target="_blank" rel="noopener noreferrer">
            {d.fuente} ↗
          </a>
        ) : (
          d.fuente
        )}
      </span>
      <span>· dato del {fechaCorta(d.fechaDato)}</span>
      {d.verificadoEn ? (
        <span title={fechaHoraRD(d.verificadoEn)}>· verificado {hace(d.verificadoEn, ahora)}</span>
      ) : null}
      {d.desactualizado ? <span className="vencido">· DESACTUALIZADO</span> : null}
      {d.ultimaCorridaFallo ? <span className="vencido">· la última lectura falló (ver Estado)</span> : null}
    </div>
  );
}
