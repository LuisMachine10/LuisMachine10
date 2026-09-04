interface Props {
  etiqueta: string
  valor: number | null
  meta?: string
  unidad: string
  paso?: number
  soloLectura?: boolean
  notaSoloLectura?: string
  onCambio: (valor: number | null) => void
}

export function CampoNumero({
  etiqueta, valor, meta, unidad, paso = 1, soloLectura = false, notaSoloLectura, onCambio,
}: Props) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="rotulo">{etiqueta}</span>
        {meta && <span className="cifra text-[11px] text-humo">meta {meta}</span>}
      </span>
      <span className="mt-1.5 flex items-center gap-2">
        <input
          className="campo"
          type="number"
          inputMode="decimal"
          step={paso}
          readOnly={soloLectura}
          value={valor ?? ''}
          placeholder="—"
          onChange={(e) => {
            const t = e.target.value.trim()
            onCambio(t === '' ? null : Number(t))
          }}
        />
        <span className="w-10 shrink-0 text-sm text-humo">{unidad}</span>
      </span>
      {soloLectura && notaSoloLectura && (
        <span className="mt-1 block text-[11px] text-dorado-400">{notaSoloLectura}</span>
      )}
    </label>
  )
}
