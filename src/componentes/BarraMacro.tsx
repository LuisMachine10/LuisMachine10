interface Props {
  etiqueta: string
  valor: number | null
  meta: number
  unidad: string
  /** Rango tolerado alrededor de la meta (calorías). Sin él, la meta es un piso. */
  tolerancia?: number
}

export function BarraMacro({ etiqueta, valor, meta, unidad, tolerancia }: Props) {
  const v = valor ?? 0
  const pct = meta > 0 ? Math.min(1.15, v / meta) : 0
  const enMeta = tolerancia !== undefined ? Math.abs(v - meta) <= tolerancia : v >= meta
  const pasado = tolerancia !== undefined && v > meta + tolerancia

  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-humo">{etiqueta}</span>
        <span className="cifra">
          <span className={enMeta ? 'text-dorado-400' : pasado ? 'text-rojo' : 'text-pergamino'}>
            {valor === null ? '—' : Math.round(v).toLocaleString('es-DO')}
          </span>
          <span className="text-humo">
            {' / '}
            {Math.round(meta).toLocaleString('es-DO')} {unidad}
          </span>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-marino-800">
        <div
          className={`h-full rounded-full transition-all ${enMeta ? 'bg-dorado-600' : pasado ? 'bg-rojo' : 'bg-marino-600'}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  )
}
