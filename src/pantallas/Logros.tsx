import { useMemo, useState } from 'react'
import { Hoja } from '../componentes/Hoja'
import { usarAreas, usarLogros, usarMetas } from '../datos/hooks'
import { borrarLogro, guardarLogro } from '../datos/metas'
import { hoyISO } from '../dominio/dias'
import type { Logro } from '../dominio/tipos'

interface Props {
  onVolver: () => void
}

/** Lo que ya pasó. Sirve para mirar atrás cuando una semana se siente perdida. */
export function Logros({ onVolver }: Props) {
  const logros = usarLogros()
  const areas = usarAreas()
  const metas = usarMetas()
  const [nuevo, setNuevo] = useState(false)
  const [borrador, setBorrador] = useState<Omit<Logro, 'id'>>({
    fecha: hoyISO(), area: 'ENTRENAMIENTO', titulo: '', detalle: '',
    metaId: null, valor: null, unidad: '', origen: 'manual',
  })

  const porMes = useMemo(() => {
    const grupos = new Map<string, Logro[]>()
    for (const l of logros) {
      const mes = l.fecha.slice(0, 7)
      grupos.set(mes, [...(grupos.get(mes) ?? []), l])
    }
    return [...grupos.entries()]
  }, [logros])

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const nombreMes = (m: string) => {
    const [a, mes] = m.split('-')
    return `${MESES[Number(mes) - 1]} ${a}`
  }

  return (
    <div className="space-y-4 pb-28">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-serif text-xl">Logros</h1>
          <p className="text-[12px] text-humo">
            {logros.length === 0
              ? 'Todavía vacío. Se llena solo cuando cumplas una meta.'
              : `${logros.length} registrado${logros.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <button type="button" className="boton px-3" onClick={onVolver}>Volver</button>
      </header>

      <button type="button" className="boton-dorado w-full" onClick={() => setNuevo(true)}>
        + Anotar un logro
      </button>

      {porMes.map(([mes, lista]) => (
        <section key={mes}>
          <span className="rotulo">{nombreMes(mes)}</span>
          <ul className="mt-2 space-y-2">
            {lista.map((l) => {
              const meta = metas.find((m) => m.id === l.metaId)
              return (
                <li key={l.id} className="tarjeta">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{l.titulo}</span>
                    <span className="cifra shrink-0 text-[11px] text-humo">{l.fecha.slice(8)}</span>
                  </div>
                  {l.detalle && <p className="mt-1 text-[12px] text-humo">{l.detalle}</p>}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-marino-600">
                      {l.area}
                      {l.origen === 'automatico' && ' · detectado por la app'}
                      {meta && ' · meta cumplida'}
                    </span>
                    <button type="button" className="text-[11px] text-humo underline"
                      onClick={() => borrarLogro(l.id!)}>
                      borrar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <Hoja abierta={nuevo} titulo="Anotar un logro" onCerrar={() => setNuevo(false)}>
        <div className="space-y-3">
          <label className="block">
            <span className="rotulo">Qué lograste</span>
            <input className="campo mt-1 font-sans text-base" value={borrador.titulo}
              onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })}
              placeholder="Primer 245 en banca" />
          </label>
          <label className="block">
            <span className="rotulo">Fecha</span>
            <input className="campo mt-1" type="date" value={borrador.fecha} max={hoyISO()}
              onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })} />
          </label>
          <label className="block">
            <span className="rotulo">Área</span>
            <select className="campo mt-1 font-sans text-base" value={borrador.area}
              onChange={(e) => setBorrador({ ...borrador, area: e.target.value })}>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="rotulo">Detalle</span>
            <input className="campo mt-1 font-sans text-sm" value={borrador.detalle}
              onChange={(e) => setBorrador({ ...borrador, detalle: e.target.value })}
              placeholder="Cómo salió, qué costó" />
          </label>
          <button
            type="button" className="boton-dorado w-full disabled:opacity-40"
            disabled={!borrador.titulo.trim()}
            onClick={async () => {
              await guardarLogro(borrador)
              setBorrador({ ...borrador, titulo: '', detalle: '' })
              setNuevo(false)
            }}
          >
            Guardar
          </button>
        </div>
      </Hoja>
    </div>
  )
}
