import { useMemo, useState } from 'react'
import { usarPerfil, usarPesos } from '../datos/hooks'
import { db } from '../datos/db'
import { borrarPeso, guardarPeso } from '../datos/registros'
import { fechaLarga, hoyISO } from '../dominio/dias'
import { LB_POR_KG } from '../dominio/metas'
import { mediaMovil } from '../dominio/promedios'

export function PesoPantalla() {
  const pesos = usarPesos()
  const perfil = usarPerfil()
  const [fecha, setFecha] = useState(hoyISO())
  const [pesoLb, setPesoLb] = useState('')
  const [pctGrasa, setPctGrasa] = useState('')
  const [cintura, setCintura] = useState('')
  const [notas, setNotas] = useState('')

  const medias = useMemo(() => mediaMovil(pesos.map((p) => p.pesoLb), 4), [pesos])
  const primero = pesos[0]?.pesoLb ?? null
  const ultimo = pesos[pesos.length - 1]?.pesoLb ?? null

  async function guardar() {
    const lb = Number(pesoLb)
    if (!lb) return
    await guardarPeso({
      fecha,
      pesoLb: lb,
      pctGrasa: pctGrasa ? Number(pctGrasa) / 100 : null,
      cinturaCm: cintura ? Number(cintura) : null,
      notas,
    })
    // El peso del perfil manda sobre las metas: si cambia, las metas cambian.
    await db.perfil.put({ ...perfil, pesoLb: lb, ...(pctGrasa ? { pctGrasaEstimado: Number(pctGrasa) / 100 } : {}) })
    setPesoLb(''); setPctGrasa(''); setCintura(''); setNotas('')
  }

  return (
    <div className="space-y-4 pb-28">
      <header>
        <h1 className="font-serif text-xl">Peso y composición</h1>
        <p className="text-[12px] text-humo">
          Sábado en la mañana, en ayunas, después del baño. La línea gruesa es la media de 4; el punto suelto es ruido.
        </p>
      </header>

      <section className="tarjeta space-y-3">
        <span className="rotulo">Registrar pesaje</span>
        <input className="campo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="rotulo">Peso (lb)</span>
            <input className="campo mt-1" type="number" inputMode="decimal" step="0.1"
              value={pesoLb} onChange={(e) => setPesoLb(e.target.value)} placeholder="220" />
          </label>
          <label className="block">
            <span className="rotulo">% grasa</span>
            <input className="campo mt-1" type="number" inputMode="decimal" step="0.1"
              value={pctGrasa} onChange={(e) => setPctGrasa(e.target.value)} placeholder="21" />
          </label>
          <label className="block">
            <span className="rotulo">Cintura</span>
            <input className="campo mt-1" type="number" inputMode="decimal" step="0.5"
              value={cintura} onChange={(e) => setCintura(e.target.value)} placeholder="cm" />
          </label>
        </div>
        <input className="campo font-sans text-sm" placeholder="Notas"
          value={notas} onChange={(e) => setNotas(e.target.value)} />
        <button type="button" className="boton-dorado w-full" onClick={guardar} disabled={!pesoLb}>
          Guardar pesaje
        </button>
        <p className="text-[11px] text-humo">
          Guardar actualiza el peso del perfil, y con él las metas de kcal, proteína y grasa.
        </p>
      </section>

      {ultimo !== null && primero !== null && (
        <section className="tarjeta grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="cifra text-2xl text-dorado-400">{ultimo.toLocaleString('es-DO')}</p>
            <p className="text-[10px] uppercase tracking-wider text-humo">lb hoy</p>
          </div>
          <div>
            <p className="cifra text-2xl">{(ultimo / LB_POR_KG).toFixed(1)}</p>
            <p className="text-[10px] uppercase tracking-wider text-humo">kg</p>
          </div>
          <div>
            <p className={`cifra text-2xl ${ultimo - primero <= 0 ? 'text-verde' : 'text-rojo'}`}>
              {(ultimo - primero >= 0 ? '+' : '') + (ultimo - primero).toFixed(1)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-humo">vs. inicio</p>
          </div>
        </section>
      )}

      <section className="tarjeta">
        <span className="rotulo">Historial</span>
        {pesos.length === 0 ? (
          <p className="mt-2 text-[12px] text-humo">Todavía no hay pesajes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-marino-800">
            {pesos.map((p, i) => (
              <li key={p.fecha} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm">{fechaLarga(p.fecha)}</span>
                  <span className="block text-[11px] text-humo">
                    {p.pctGrasa !== null && `${(p.pctGrasa * 100).toFixed(1)}% grasa`}
                    {p.cinturaCm !== null && ` · cintura ${p.cinturaCm} cm`}
                    {p.notas && ` · ${p.notas}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="cifra block text-sm">{p.pesoLb.toLocaleString('es-DO')} lb</span>
                  <span className="cifra block text-[11px] text-dorado-400">
                    {medias[i] !== null ? `media ${medias[i]!.toFixed(1)}` : 'media —'}
                  </span>
                </span>
                <button type="button" className="text-[11px] text-humo underline" onClick={() => borrarPeso(p.fecha)}>
                  borrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
