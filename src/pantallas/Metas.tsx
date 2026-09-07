import { useMemo, useState } from 'react'
import { Hoja } from '../componentes/Hoja'
import { INICIO_PLAN } from '../datos/db'
import {
  usarAjuste, usarAnaliticas, usarAreas, usarLogros, usarMetas, usarPerfil, usarPesos,
  usarSesiones, usarTodosLosEjercicios, usarTodosLosRegistros,
} from '../datos/hooks'
import { actualizarValorManual, borrarMeta, cambiarEstadoMeta, guardarMeta } from '../datos/metas'
import { metasSugeridas } from '../datos/seed/sugerencias'
import type { MetaSugerida } from '../datos/seed/sugerencias'
import { fechaLarga, hoyISO, sumarDias } from '../dominio/dias'
import { ETIQUETA_SEMAFORO, medirMeta, resumirMetas, semaforoMeta } from '../dominio/metas-personales'
import type { FuentesDeDatos, Semaforo } from '../dominio/metas-personales'
import type { MetaPersonal } from '../dominio/tipos'

const COLOR: Record<Semaforo, string> = {
  lograda: 'text-dorado-400',
  'en-ritmo': 'text-pergamino',
  atrasada: 'text-rojo',
  vencida: 'text-rojo',
  'sin-datos': 'text-humo',
}

interface Props {
  onIr: (pantalla: 'logros') => void
}

export function Metas({ onIr }: Props) {
  const [verSugeridas, setVerSugeridas] = useState(false)
  const [editando, setEditando] = useState<MetaPersonal | null>(null)
  const [nueva, setNueva] = useState(false)

  const perfil = usarPerfil()
  const metas = usarMetas()
  const areas = usarAreas()
  const logros = usarLogros()
  const pesos = usarPesos()
  const analiticas = usarAnaliticas()
  const sesiones = usarSesiones()
  const registros = usarTodosLosRegistros()
  const ejercicios = usarTodosLosEjercicios()
  const ajusteInicio = usarAjuste('inicioPlan')
  const inicio = (ajusteInicio?.valor as string) ?? INICIO_PLAN

  const datos: FuentesDeDatos = useMemo(
    () => ({ pesos, analiticas, sesiones, registros, perfil }),
    [pesos, analiticas, sesiones, registros, perfil],
  )
  const resumen = useMemo(() => resumirMetas(metas, datos), [metas, datos])
  const sugeridas = useMemo(() => metasSugeridas(inicio, ejercicios), [inicio, ejercicios])
  const yaAdoptadas = new Set(metas.map((m) => m.nombre))

  const activas = metas.filter((m) => m.estado === 'activa')
  const logradas = metas.filter((m) => m.estado === 'lograda')
  const pausadas = metas.filter((m) => m.estado === 'pausada')

  async function adoptar(s: MetaSugerida) {
    const { clave: _clave, porque: _porque, ...meta } = s
    await guardarMeta(meta)
  }

  function tarjeta(meta: MetaPersonal) {
    const m = medirMeta(meta, datos)
    const sem = semaforoMeta(meta, m)
    const pct = m.progreso === null ? null : Math.round(m.progreso * 100)
    return (
      <li key={meta.id} className="tarjeta">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold leading-tight">{meta.nombre}</span>
          <span className={`shrink-0 text-[11px] ${COLOR[sem]}`}>{ETIQUETA_SEMAFORO[sem]}</span>
        </div>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-marino-600">{meta.area}</p>

        {meta.tipo === 'numerica' && (
          <>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="cifra text-[13px]">
                <span className="text-pergamino">{m.valorActual ?? '—'}</span>
                <span className="text-humo"> → {meta.valorMeta} {meta.unidad}</span>
              </span>
              <span className="cifra text-[12px] text-humo">{pct === null ? '—' : `${pct}%`}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-marino-800">
              <div
                className={`h-full rounded-full ${sem === 'atrasada' || sem === 'vencida' ? 'bg-rojo' : 'bg-dorado-600'}`}
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          </>
        )}

        <p className="mt-1.5 text-[11px] text-humo">{m.procedencia}</p>
        {meta.fechaLimite && (
          <p className="text-[11px] text-humo">
            {m.diasRestantes !== null && m.diasRestantes >= 0
              ? `Faltan ${m.diasRestantes} días — ${fechaLarga(meta.fechaLimite)}`
              : `Venció el ${fechaLarga(meta.fechaLimite)}`}
            {m.ritmoNecesario !== null &&
              ` · hacen falta ${m.ritmoNecesario.toFixed(1)} ${meta.unidad}/semana`}
          </p>
        )}

        {meta.fuente === 'manual' && meta.tipo === 'numerica' && (
          <div className="mt-2 flex items-center gap-2">
            <input
              className="campo py-1.5 text-base" type="number" inputMode="decimal"
              placeholder="valor actual" defaultValue={meta.valorManual ?? ''}
              onBlur={(e) => actualizarValorManual(meta.id!, e.target.value === '' ? null : Number(e.target.value))}
            />
            <span className="w-10 shrink-0 text-[11px] text-humo">{meta.unidad}</span>
          </div>
        )}

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {meta.estado !== 'lograda' && (
            <button type="button" className="boton py-1 text-[11px]"
              onClick={() => cambiarEstadoMeta(meta.id!, 'lograda')}>
              Lograda
            </button>
          )}
          <button type="button" className="boton py-1 text-[11px]"
            onClick={() => cambiarEstadoMeta(meta.id!, meta.estado === 'pausada' ? 'activa' : 'pausada')}>
            {meta.estado === 'pausada' ? 'Reactivar' : 'Pausar'}
          </button>
          <button type="button" className="boton py-1 text-[11px]" onClick={() => setEditando(meta)}>
            Editar
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-4 pb-28">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-serif text-xl">Metas</h1>
          <p className="text-[12px] text-humo">Sin fecha es un deseo. Con fecha es una meta.</p>
        </div>
        <button type="button" className="boton px-3 text-[12px]" onClick={() => onIr('logros')}>
          Logros {logros.length > 0 && `(${logros.length})`}
        </button>
      </header>

      {metas.length > 0 && (
        <section className="tarjeta grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="cifra text-xl text-dorado-400">{resumen.logradas}</p>
            <p className="text-[10px] uppercase tracking-wider text-humo">logradas</p>
          </div>
          <div>
            <p className="cifra text-xl">{resumen.enRitmo}</p>
            <p className="text-[10px] uppercase tracking-wider text-humo">en ritmo</p>
          </div>
          <div>
            <p className={`cifra text-xl ${resumen.atrasadas > 0 ? 'text-rojo' : ''}`}>{resumen.atrasadas}</p>
            <p className="text-[10px] uppercase tracking-wider text-humo">atrasadas</p>
          </div>
          <div>
            <p className="cifra text-xl text-humo">{resumen.sinDatos}</p>
            <p className="text-[10px] uppercase tracking-wider text-humo">sin dato</p>
          </div>
        </section>
      )}

      {metas.length === 0 && (
        <section className="tarjeta">
          <p className="text-[13px]">Todavía no tienes metas.</p>
          <p className="mt-1 text-[12px] text-humo">
            Tu Excel ya trae {sugeridas.length} propuestas, cada una con la hoja de donde salió.
            Adopta las que te sirvan y escribe las tuyas.
          </p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-dorado" onClick={() => setVerSugeridas(true)}>
          Ver sugeridas
        </button>
        <button type="button" className="boton" onClick={() => setNueva(true)}>
          + Meta nueva
        </button>
      </div>

      {activas.length > 0 && (
        <>
          <span className="rotulo">Activas</span>
          <ul className="space-y-3">{activas.map(tarjeta)}</ul>
        </>
      )}
      {logradas.length > 0 && (
        <>
          <span className="rotulo">Logradas</span>
          <ul className="space-y-3">{logradas.map(tarjeta)}</ul>
        </>
      )}
      {pausadas.length > 0 && (
        <>
          <span className="rotulo">Pausadas</span>
          <ul className="space-y-3">{pausadas.map(tarjeta)}</ul>
        </>
      )}

      <Hoja abierta={verSugeridas} titulo="Metas que salen de tu Excel" onCerrar={() => setVerSugeridas(false)}>
        <ul className="space-y-2">
          {sugeridas.map((s) => {
            const adoptada = yaAdoptadas.has(s.nombre)
            return (
              <li key={s.clave} className="rounded border border-marino-800 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold leading-tight">{s.nombre}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-marino-600">{s.area}</span>
                </div>
                {s.tipo === 'numerica' && (
                  <p className="cifra mt-1 text-[11px] text-humo">
                    {s.valorInicial ?? '—'} → {s.valorMeta} {s.unidad}
                    {s.fechaLimite && ` · ${s.fechaLimite}`}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-humo">{s.porque}</p>
                <button
                  type="button" className="boton mt-2 w-full py-1.5 text-[12px] disabled:opacity-40"
                  disabled={adoptada} onClick={() => adoptar(s)}
                >
                  {adoptada ? 'Ya la adoptaste' : 'Adoptar'}
                </button>
              </li>
            )
          })}
        </ul>
      </Hoja>

      <EditorMeta
        abierta={nueva || editando !== null}
        meta={editando}
        areas={areas.map((a) => a.id)}
        inicio={inicio}
        onCerrar={() => { setNueva(false); setEditando(null) }}
        onBorrar={editando?.id ? () => { borrarMeta(editando.id!); setEditando(null) } : undefined}
      />
    </div>
  )
}

interface EditorProps {
  abierta: boolean
  meta: MetaPersonal | null
  areas: string[]
  inicio: string
  onCerrar: () => void
  onBorrar?: () => void
}

function EditorMeta({ abierta, meta, areas, inicio, onCerrar, onBorrar }: EditorProps) {
  const vacia: Omit<MetaPersonal, 'id' | 'creadaEn'> = {
    area: areas[0] ?? 'CUERPO', nombre: '', tipo: 'numerica', fuente: 'manual',
    valorInicial: null, valorMeta: null, valorManual: null, unidad: '',
    direccion: 'bajar', fechaInicio: hoyISO(), fechaLimite: sumarDias(hoyISO(), 84),
    estado: 'activa', nota: '',
  }
  const [borrador, setBorrador] = useState(vacia)
  const [ultimaMeta, setUltimaMeta] = useState<number | null | undefined>(undefined)

  // Al abrir sobre una meta distinta, recarga el borrador.
  if (abierta && meta?.id !== ultimaMeta) {
    setUltimaMeta(meta?.id ?? null)
    setBorrador(meta ? { ...meta } : vacia)
  }

  const set = (p: Partial<MetaPersonal>) => setBorrador({ ...borrador, ...p })

  return (
    <Hoja abierta={abierta} titulo={meta ? 'Editar meta' : 'Meta nueva'} onCerrar={onCerrar}>
      <div className="space-y-3">
        <label className="block">
          <span className="rotulo">Qué quieres lograr</span>
          <input className="campo mt-1 font-sans text-base" value={borrador.nombre}
            onChange={(e) => set({ nombre: e.target.value })} placeholder="Bajar a 204 lb" />
        </label>

        <label className="block">
          <span className="rotulo">Área</span>
          <select className="campo mt-1 font-sans text-base" value={borrador.area}
            onChange={(e) => set({ area: e.target.value })}>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          {(['numerica', 'hito'] as const).map((t) => (
            <button key={t} type="button" onClick={() => set({ tipo: t })}
              className={`min-h-[44px] rounded border text-[12px] font-semibold ${
                borrador.tipo === t ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
              }`}>
              {t === 'numerica' ? 'Llega a un número' : 'Se cumple o no'}
            </button>
          ))}
        </div>

        {borrador.tipo === 'numerica' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="rotulo">Hoy</span>
                <input className="campo mt-1 py-2 text-base" type="number" inputMode="decimal"
                  value={borrador.valorInicial ?? ''}
                  onChange={(e) => set({ valorInicial: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="rotulo">Meta</span>
                <input className="campo mt-1 py-2 text-base" type="number" inputMode="decimal"
                  value={borrador.valorMeta ?? ''}
                  onChange={(e) => set({ valorMeta: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="rotulo">Unidad</span>
                <input className="campo mt-1 py-2 font-sans text-base" value={borrador.unidad}
                  onChange={(e) => set({ unidad: e.target.value })} placeholder="lb" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['bajar', 'subir'] as const).map((d) => (
                <button key={d} type="button" onClick={() => set({ direccion: d })}
                  className={`min-h-[44px] rounded border text-[12px] font-semibold ${
                    borrador.direccion === d ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
                  }`}>
                  {d === 'bajar' ? 'Bajar el número' : 'Subir el número'}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="block">
          <span className="rotulo">Fecha límite</span>
          <input className="campo mt-1" type="date" value={borrador.fechaLimite ?? ''}
            onChange={(e) => set({ fechaLimite: e.target.value || null })} />
          <span className="mt-1 block text-[11px] text-humo">
            El plan de 12 semanas arrancó el {inicio}.
          </span>
        </label>

        <label className="block">
          <span className="rotulo">Nota</span>
          <input className="campo mt-1 font-sans text-sm" value={borrador.nota}
            onChange={(e) => set({ nota: e.target.value })} placeholder="Por qué importa" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {onBorrar ? (
            <button type="button" className="boton text-rojo" onClick={() => { onBorrar(); onCerrar() }}>
              Borrar
            </button>
          ) : (
            <button type="button" className="boton" onClick={onCerrar}>Cancelar</button>
          )}
          <button
            type="button" className="boton-dorado disabled:opacity-40"
            disabled={!borrador.nombre.trim()}
            onClick={async () => {
              await guardarMeta(meta?.id ? { ...borrador, id: meta.id } : borrador)
              onCerrar()
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </Hoja>
  )
}
