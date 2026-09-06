import { useMemo, useState } from 'react'
import { Hoja } from './Hoja'
import { buscarAlimentos } from '../dominio/comidas'
import { avisoDePesaje, macrosDeItem } from '../dominio/macros'
import type { Alimento } from '../dominio/tipos'

interface Props {
  abierto: boolean
  alimentos: Alimento[]
  onCerrar: () => void
  onAgregar: (alimentoId: number, gramos: number) => void
  onAlternarFavorito: (alimentoId: number) => void
}

export function SelectorAlimento({ abierto, alimentos, onCerrar, onAgregar, onAlternarFavorito }: Props) {
  const [consulta, setConsulta] = useState('')
  const [elegido, setElegido] = useState<Alimento | null>(null)
  const [gramos, setGramos] = useState(0)

  const resultados = useMemo(() => buscarAlimentos(alimentos, consulta), [alimentos, consulta])
  const macros = elegido ? macrosDeItem(elegido, gramos) : null
  const medidas = elegido && elegido.gramosPorMedida > 0 ? elegido.gramosPorMedida : 0

  function cerrar() {
    setElegido(null); setConsulta(''); setGramos(0); onCerrar()
  }

  return (
    <Hoja abierta={abierto} titulo={elegido ? elegido.nombre : 'Agregar alimento'} onCerrar={cerrar}>
      {!elegido ? (
        <>
          <input
            className="campo font-sans text-base"
            placeholder="Buscar alimento…"
            autoComplete="off"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
          />
          <ul className="mt-2 divide-y divide-marino-800">
            {resultados.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="min-h-[52px] flex-1 py-2 text-left"
                  onClick={() => { setElegido(a); setGramos(a.gramosPorMedida || 100) }}
                >
                  <span className="block text-sm">{a.nombre}</span>
                  <span className="cifra block text-[11px] text-humo">
                    {a.kcal100g} kcal · {a.prot100g} P · {a.carb100g} C · {a.grasa100g} G — por 100 g
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={a.favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
                  className={`min-h-[44px] w-10 text-lg ${a.favorito ? 'text-dorado-400' : 'text-marino-700'}`}
                  onClick={() => onAlternarFavorito(a.id)}
                >
                  ★
                </button>
              </li>
            ))}
            {resultados.length === 0 && (
              <li className="py-4 text-center text-[12px] text-humo">Ningún alimento con ese nombre.</li>
            )}
          </ul>
        </>
      ) : (
        <div className="space-y-4">
          {avisoDePesaje(elegido) && (
            <p className="rounded border border-dorado-600/60 bg-dorado-600/10 px-3 py-2 text-[13px] font-bold text-dorado-400">
              {avisoDePesaje(elegido)}
            </p>
          )}
          {elegido.nota && <p className="text-[12px] text-humo">{elegido.nota}</p>}

          <label className="block">
            <span className="rotulo">Gramos</span>
            <input
              className="campo mt-1 text-2xl"
              type="number" inputMode="decimal" min={0} step={5} autoFocus
              value={gramos || ''}
              onChange={(e) => setGramos(Number(e.target.value) || 0)}
            />
          </label>

          {medidas > 0 && (
            <div>
              <span className="rotulo">{elegido.medidaComun} = {medidas} g</span>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" className="boton" onClick={() => setGramos(medidas * n)}>
                    ×{n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 rounded border border-marino-800 bg-marino-900/60 p-3 text-center">
            {[
              ['kcal', macros!.kcal],
              ['prot', macros!.proteinaG],
              ['carb', macros!.carbG],
              ['grasa', macros!.grasaG],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta as string}>
                <p className="cifra text-lg text-dorado-400">{Math.round(valor as number)}</p>
                <p className="text-[10px] uppercase tracking-wider text-humo">{etiqueta}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="boton" onClick={() => setElegido(null)}>
              Volver
            </button>
            <button
              type="button" className="boton-dorado" disabled={gramos <= 0}
              onClick={() => { onAgregar(elegido.id, gramos); cerrar() }}
            >
              Agregar
            </button>
          </div>
        </div>
      )}
    </Hoja>
  )
}
