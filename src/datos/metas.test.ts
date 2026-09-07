import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, sembrar } from './db'
import { cerrarMetasCumplidas, guardarMeta } from './metas'
import { guardarPeso } from './registros'
import { PERFIL_SUGERIDO } from '../dominio/metas'
import { metasSugeridas } from './seed/sugerencias'

const metaPeso = {
  area: 'COMPOSICIÓN', nombre: 'Bajar a 204 lb', tipo: 'numerica' as const, fuente: 'peso' as const,
  valorInicial: 220, valorMeta: 204, valorManual: null, unidad: 'lb',
  direccion: 'bajar' as const, fechaInicio: '2026-09-07', fechaLimite: '2026-11-29',
  estado: 'activa' as const, nota: '',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await sembrar()
  await db.perfil.put({ ...PERFIL_SUGERIDO, nombre: 'Luis', completado: true })
})

describe('la app arranca de cero', () => {
  it('el perfil sembrado está vacío y sin confirmar', async () => {
    await db.delete()
    await db.open()
    await sembrar()
    const p = (await db.perfil.get('perfil'))!
    expect(p.nombre).toBe('')
    expect(p.pesoLb).toBe(0)
    expect(p.completado).toBe(false)
  })

  it('los catálogos de referencia sí vienen puestos: eso no es dato personal', async () => {
    expect(await db.alimentos.count()).toBe(44)
    expect(await db.areas.count()).toBe(10)
  })
})

describe('las metas se cierran solas cuando se cumplen', () => {
  it('llegar al número cierra la meta y deja el logro escrito', async () => {
    const id = await guardarMeta(metaPeso)
    await guardarPeso({ fecha: '2026-10-03', pesoLb: 203, pctGrasa: null, cinturaCm: null, notas: '' })

    expect(await cerrarMetasCumplidas()).toBe(1)
    expect((await db.metas.get(id))!.estado).toBe('lograda')

    const logros = await db.logros.toArray()
    expect(logros).toHaveLength(1)
    expect(logros[0].titulo).toBe('Bajar a 204 lb')
    expect(logros[0].origen).toBe('automatico')
    expect(logros[0].valor).toBe(203)
  })

  it('no la cierra mientras el número no llegue', async () => {
    await guardarMeta(metaPeso)
    await guardarPeso({ fecha: '2026-10-03', pesoLb: 210, pctGrasa: null, cinturaCm: null, notas: '' })
    expect(await cerrarMetasCumplidas()).toBe(0)
    expect(await db.logros.count()).toBe(0)
  })

  it('no duplica el logro si se vuelve a correr', async () => {
    await guardarMeta(metaPeso)
    await guardarPeso({ fecha: '2026-10-03', pesoLb: 203, pctGrasa: null, cinturaCm: null, notas: '' })
    await cerrarMetasCumplidas()
    await cerrarMetasCumplidas()
    expect(await db.logros.count()).toBe(1)
  })

  it('un hito nunca se cierra solo: eso lo decides tú', async () => {
    await guardarMeta({ ...metaPeso, nombre: 'Aprobar CFI-FMVA', tipo: 'hito', fuente: 'manual' })
    await guardarPeso({ fecha: '2026-10-03', pesoLb: 203, pctGrasa: null, cinturaCm: null, notas: '' })
    expect(await cerrarMetasCumplidas()).toBe(0)
  })

  it('editar una meta conserva su fecha de creación', async () => {
    const id = await guardarMeta(metaPeso)
    const creada = (await db.metas.get(id))!.creadaEn
    await new Promise((r) => setTimeout(r, 5))
    await guardarMeta({ ...metaPeso, id, valorMeta: 200 })
    const despues = (await db.metas.get(id))!
    expect(despues.creadaEn).toBe(creada)
    expect(despues.valorMeta).toBe(200)
  })
})

describe('las metas sugeridas salen del Excel', () => {
  it('cada una trae su origen y una fecha, o es un hito', async () => {
    const ejercicios = await db.ejercicios.toArray()
    const sugeridas = metasSugeridas('2026-09-07', ejercicios)
    expect(sugeridas.length).toBeGreaterThan(10)
    for (const s of sugeridas) {
      expect(s.porque.length).toBeGreaterThan(15)
      expect(s.nombre.length).toBeGreaterThan(3)
      if (s.tipo === 'numerica') expect(s.valorMeta).not.toBeNull()
    }
  })

  it('las metas de gimnasio se enlazan al ejercicio real, no a texto suelto', async () => {
    const ejercicios = await db.ejercicios.toArray()
    const banca = metasSugeridas('2026-09-07', ejercicios).find((s) => s.clave === 'banca')!
    expect(banca.fuente).toMatch(/^ejercicio:\d+$/)
    const id = Number(String(banca.fuente).split(':')[1])
    expect((await db.ejercicios.get(id))!.nombre).toContain('Press de banca')
  })

  it('adoptar una sugerencia la vuelve una meta tuya', async () => {
    const ejercicios = await db.ejercicios.toArray()
    const { clave: _c, porque: _p, ...meta } = metasSugeridas('2026-09-07', ejercicios)[0]
    await guardarMeta(meta)
    expect(await db.metas.count()).toBe(1)
  })
})

describe('el respaldo incluye metas y logros', () => {
  it('exporta e importa lo nuevo sin perder nada', async () => {
    const { exportarRespaldo, importarRespaldo } = await import('./db')
    await guardarMeta(metaPeso)
    await guardarPeso({ fecha: '2026-10-03', pesoLb: 203, pctGrasa: null, cinturaCm: null, notas: '' })
    await cerrarMetasCumplidas()

    const respaldo = await exportarRespaldo()
    expect(respaldo.metas).toHaveLength(1)
    expect(respaldo.logros).toHaveLength(1)

    await db.metas.clear()
    await db.logros.clear()
    const r = await importarRespaldo(JSON.parse(JSON.stringify(respaldo)))
    expect(r.metas).toBe(1)
    expect(r.logros).toBe(1)
    expect(await db.metas.count()).toBe(1)
  })
})
