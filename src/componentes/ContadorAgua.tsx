import { VASOS_META, VASO_L } from '../datos/registros'

interface Props {
  vasos: number
  metaL: number
  onFijar: (vasos: number) => void
}

/** 8 vasos de 625 ml = 5 L. Un toque por vaso; tocar el último otra vez lo quita. */
export function ContadorAgua({ vasos, metaL, onFijar }: Props) {
  const litros = vasos * VASO_L
  return (
    <div className="tarjeta">
      <div className="flex items-baseline justify-between">
        <span className="rotulo">Agua</span>
        <span className="cifra text-sm">
          <span className={litros >= metaL ? 'text-dorado-400' : 'text-pergamino'}>
            {litros.toLocaleString('es-DO', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-humo"> / {metaL} L</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {Array.from({ length: VASOS_META }, (_, i) => {
          const lleno = i < vasos
          return (
            <button
              key={i}
              type="button"
              aria-label={`Vaso ${i + 1} de ${VASOS_META}`}
              onClick={() => onFijar(vasos === i + 1 ? i : i + 1)}
              className={`h-12 rounded border transition active:scale-95 ${
                lleno ? 'border-dorado-600 bg-dorado-600/70' : 'border-marino-700 bg-marino-950'
              }`}
            />
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-humo">625 ml por vaso. Los viernes de ayuno, con electrolitos.</p>
    </div>
  )
}
