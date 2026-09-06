import { useState } from 'react'
import { fechaLarga } from '../dominio/dias'
import type { Peso } from '../dominio/tipos'

interface Props {
  pesos: Peso[]
  medias: (number | null)[]
}

const AN = 340
const AL = 170
const M = { arriba: 16, derecha: 14, abajo: 26, izquierda: 38 }

/**
 * La línea gruesa es la media de 4; el punto suelto es ruido.
 * Una sola entidad (tu peso) en dos lecturas: no lleva leyenda, lleva rótulos directos.
 */
export function GraficaPeso({ pesos, medias }: Props) {
  const [activo, setActivo] = useState<number | null>(null)

  if (pesos.length < 2) {
    return (
      <p className="py-6 text-center text-[12px] text-humo">
        Con dos pesajes empieza la tendencia. Llevas {pesos.length}.
      </p>
    )
  }

  const valores = pesos.map((p) => p.pesoLb)
  const min = Math.min(...valores) - 2
  const max = Math.max(...valores) + 2
  const anchoUtil = AN - M.izquierda - M.derecha
  const altoUtil = AL - M.arriba - M.abajo
  const x = (i: number) => M.izquierda + (pesos.length === 1 ? anchoUtil / 2 : (i / (pesos.length - 1)) * anchoUtil)
  const y = (v: number) => M.arriba + altoUtil - ((v - min) / (max - min || 1)) * altoUtil

  const puntosMedia = medias
    .map((m, i) => (m === null ? null : `${x(i)},${y(m)}`))
    .filter((p): p is string => p !== null)

  const marcas = [min, (min + max) / 2, max]
  const p = activo !== null ? pesos[activo] : null

  return (
    <div>
      <svg
        viewBox={`0 0 ${AN} ${AL}`} width="100%" role="img"
        aria-label={`Peso de ${pesos.length} pesajes, de ${valores[0]} a ${valores[valores.length - 1]} libras`}
        onMouseLeave={() => setActivo(null)}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line x1={M.izquierda} x2={AN - M.derecha} y1={y(v)} y2={y(v)} stroke="#1F3A5F" strokeWidth="1" />
            <text x={M.izquierda - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="#9AA7B8" fontFamily="monospace">
              {v.toFixed(0)}
            </text>
          </g>
        ))}

        {puntosMedia.length > 1 && (
          <polyline points={puntosMedia.join(' ')} fill="none" stroke="#B8860B" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {pesos.map((peso, i) => (
          <circle
            key={peso.fecha} cx={x(i)} cy={y(peso.pesoLb)} r={activo === i ? 5.5 : 4}
            fill={activo === i ? '#EDE7DA' : '#9AA7B8'} stroke="#0C1826" strokeWidth="2"
          />
        ))}

        {pesos.map((peso, i) => (
          <rect
            key={`t-${peso.fecha}`} x={x(i) - anchoUtil / (pesos.length * 2) - 6} y={0}
            width={anchoUtil / pesos.length + 12} height={AL} fill="transparent"
            onMouseEnter={() => setActivo(i)} onClick={() => setActivo(activo === i ? null : i)}
          />
        ))}

        <text x={M.izquierda} y={AL - 8} fontSize="9" fill="#9AA7B8">primer pesaje</text>
        <text x={AN - M.derecha} y={AL - 8} fontSize="9" fill="#9AA7B8" textAnchor="end">hoy</text>
      </svg>

      <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 bg-dorado-600" />
            <span className="text-humo">media de 4</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-humo" />
            <span className="text-humo">pesaje suelto</span>
          </span>
        </span>
        {p && (
          <span className="cifra text-dorado-400">
            {fechaLarga(p.fecha)}: {p.pesoLb} lb
          </span>
        )}
      </div>
    </div>
  )
}
