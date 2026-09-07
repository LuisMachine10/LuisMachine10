import { describe, expect, it } from 'vitest'
import { medirMeta, resumirMetas, semaforoMeta } from './metas-personales'
import type { FuentesDeDatos } from './metas-personales'
import { PERFIL_SUGERIDO } from './metas'
import { registroVacio } from './puntaje'
import type { MetaPersonal } from './tipos'

const vacias: FuentesDeDatos = {
  pesos: [], analiticas: [], sesiones: [], registros: [], perfil: PERFIL_SUGERIDO,
}

function meta(p: Partial<MetaPersonal> = {}): MetaPersonal {
  return {
    area: 'CUERPO', nombre: 'Bajar a 204 lb', tipo: 'numerica', fuente: 'peso',
    valorInicial: 220, valorMeta: 204, valorManual: null, unidad: 'lb',
    direccion: 'bajar', fechaInicio: '2026-09-07', fechaLimite: '2026-11-29',
    estado: 'activa', nota: '', creadaEn: 0, ...p,
  }
}

describe('las metas se miden solas desde los datos que ya existen', () => {
  it('una meta de peso lee el último pesaje, con su procedencia', () => {
    const d: FuentesDeDatos = {
      ...vacias,
      pesos: [
        { fecha: '2026-09-05', pesoLb: 220, pctGrasa: 0.21, cinturaCm: 96, notas: '' },
        { fecha: '2026-10-03', pesoLb: 212, pctGrasa: null, cinturaCm: null, notas: '' },
      ],
    }
    const m = medirMeta(meta(), d, '2026-10-05')
    expect(m.valorActual).toBe(212)
    expect(m.progreso).toBeCloseTo(0.5, 2) // 8 lb de 16
    expect(m.alcanzada).toBe(false)
    expect(m.procedencia).toContain('2026-10-03')
  })

  it('sin pesajes no inventa un cero: devuelve null y lo dice', () => {
    const m = medirMeta(meta(), vacias)
    expect(m.valorActual).toBeNull()
    expect(m.progreso).toBeNull()
    expect(m.procedencia).toContain('Sin pesajes')
  })

  it('una meta de bajar se alcanza al llegar o pasar por debajo', () => {
    const bajo = (lb: number) => medirMeta(meta(), {
      ...vacias, pesos: [{ fecha: '2026-10-03', pesoLb: lb, pctGrasa: null, cinturaCm: null, notas: '' }],
    }).alcanzada
    expect(bajo(205)).toBe(false)
    expect(bajo(204)).toBe(true)
    expect(bajo(200)).toBe(true)
  })

  it('una meta de subir se mide al revés', () => {
    const subir = meta({
      nombre: 'HDL sobre 50', fuente: 'analitica:hdl', direccion: 'subir',
      valorInicial: 44, valorMeta: 50, unidad: 'mg/dL',
    })
    const d: FuentesDeDatos = {
      ...vacias,
      analiticas: [
        { fecha: '2026-09-05', colTotal: null, ldl: 132, hdl: 44, trigliceridos: null, alt: null, ast: null, notas: '' },
        { fecha: '2026-11-29', colTotal: null, ldl: 96, hdl: 52, trigliceridos: null, alt: null, ast: null, notas: '' },
      ],
    }
    const m = medirMeta(subir, d, '2026-12-01')
    expect(m.valorActual).toBe(52)
    expect(m.alcanzada).toBe(true)
  })

  it('el LDL se lee de la última analítica registrada', () => {
    const ldl = meta({ nombre: 'LDL bajo 100', fuente: 'analitica:ldl', valorInicial: 132, valorMeta: 100, unidad: 'mg/dL' })
    const d: FuentesDeDatos = {
      ...vacias,
      analiticas: [{ fecha: '2026-09-05', colTotal: null, ldl: 132, hdl: null, trigliceridos: null, alt: null, ast: null, notas: '' }],
    }
    expect(medirMeta(ldl, d).valorActual).toBe(132)
  })

  it('una meta de gimnasio toma el mejor peso completado, no el intentado', () => {
    const banca = meta({
      nombre: 'Banca 245', fuente: 'ejercicio:2', direccion: 'subir',
      valorInicial: 215, valorMeta: 245, unidad: 'lb',
    })
    const d: FuentesDeDatos = {
      ...vacias,
      sesiones: [{
        fecha: '2026-09-07', diaSplit: 1, duracionMin: 70,
        series: [
          { ejercicioId: 2, setNum: 1, pesoLb: 225, reps: 5, rpe: 8, completada: true },
          { ejercicioId: 2, setNum: 2, pesoLb: 265, reps: null, rpe: null, completada: false },
        ],
      }],
    }
    expect(medirMeta(banca, d).valorActual).toBe(225)
  })

  it('el margen de cumplimiento sale del estado de resultados', () => {
    const margen = meta({
      nombre: 'Margen 75%', fuente: 'margenCumplimiento', direccion: 'subir',
      valorInicial: 0, valorMeta: 75, unidad: '%',
    })
    const d: FuentesDeDatos = {
      ...vacias,
      registros: [{ ...registroVacio('2026-09-07', 'ENTRENO'), levantar5am: true, entrenamiento: true }],
    }
    expect(medirMeta(margen, d).valorActual).toBe(23) // 23 de 100
  })

  it('calcula el ritmo semanal que hace falta para llegar a tiempo', () => {
    const d: FuentesDeDatos = {
      ...vacias, pesos: [{ fecha: '2026-10-05', pesoLb: 212, pctGrasa: null, cinturaCm: null, notas: '' }],
    }
    const m = medirMeta(meta(), d, '2026-11-01') // faltan 28 días = 4 semanas, faltan 8 lb
    expect(m.diasRestantes).toBe(28)
    expect(m.ritmoNecesario).toBeCloseTo(2, 5)
  })
})

describe('el semáforo compara el avance con el tiempo, no con el deseo', () => {
  const conPeso = (lb: number): FuentesDeDatos => ({
    ...vacias, pesos: [{ fecha: '2026-10-01', pesoLb: lb, pctGrasa: null, cinturaCm: null, notas: '' }],
  })
  const evaluar = (lb: number, hoy: string) => {
    const d = conPeso(lb)
    return semaforoMeta(meta(), medirMeta(meta(), d, hoy), hoy)
  }

  it('a mitad de plazo con la mitad del avance va en ritmo', () => {
    expect(evaluar(212, '2026-10-19')).toBe('en-ritmo')
  })

  it('a mitad de plazo sin avance está atrasada', () => {
    expect(evaluar(220, '2026-10-19')).toBe('atrasada')
  })

  it('llegar al número la marca lograda aunque falte plazo', () => {
    expect(evaluar(203, '2026-09-20')).toBe('lograda')
  })

  it('pasada la fecha sin llegar, queda vencida', () => {
    expect(evaluar(215, '2026-12-15')).toBe('vencida')
  })

  it('sin datos lo dice, no asume cero', () => {
    expect(semaforoMeta(meta(), medirMeta(meta(), vacias), '2026-10-19')).toBe('sin-datos')
  })

  it('da 10% de holgura: el progreso no es lineal', () => {
    // 45% de avance con 50% de plazo transcurrido todavía es "en ritmo".
    expect(evaluar(212.8, '2026-10-19')).toBe('en-ritmo')
  })
})

describe('un hito se cumple o no se cumple', () => {
  const hito = meta({
    nombre: 'Aprobar CFI-FMVA', tipo: 'hito', fuente: 'manual',
    valorInicial: null, valorMeta: null, unidad: '',
  })

  it('pendiente va en cero', () => {
    expect(medirMeta(hito, vacias).progreso).toBe(0)
  })

  it('marcado como logrado va en uno', () => {
    const m = medirMeta({ ...hito, estado: 'lograda' }, vacias)
    expect(m.progreso).toBe(1)
    expect(m.alcanzada).toBe(true)
  })
})

describe('resumen de metas', () => {
  it('cuenta logradas, en ritmo, atrasadas y sin datos, e ignora las pausadas', () => {
    const d = { ...vacias, pesos: [{ fecha: '2026-10-01', pesoLb: 220, pctGrasa: null, cinturaCm: null, notas: '' }] }
    const r = resumirMetas(
      [
        meta({ estado: 'lograda' }),
        meta(),                                  // sin avance a mitad de plazo
        meta({ fuente: 'analitica:ldl' }),       // sin analítica
        meta({ estado: 'pausada' }),
      ],
      d,
      '2026-10-19',
    )
    expect(r).toEqual({ total: 3, logradas: 1, enRitmo: 0, atrasadas: 1, sinDatos: 1 })
  })
})
