import type { MetaDelDia, MetasDiarias, Perfil, TipoDia } from './tipos'

export const LB_POR_KG = 2.2046

/**
 * Punto de partida en blanco. Los valores del panel son los del Excel
 * porque son fórmulas, no datos tuyos; lo tuyo empieza vacío y lo llenas tú.
 */
export const PERFIL_VACIO: Perfil = {
  id: 'perfil',
  nombre: '',
  fechaNacimiento: null,
  edad: 0,
  ciudad: '',
  ocupacion: '',
  pesoLb: 0,
  estaturaCm: 0,
  pctGrasaEstimado: 0,
  factorActividad: 1.55,
  deficitEntreno: 400,
  deficitLigero: 700,
  aguaMetaL: 5,
  estudioMetaMin: 120,
  suenoMetaH: 6.5,
  toleranciaKcal: 150,
  techoKcalAyuno: 200,
  completado: false,
  creadoEn: 0,
}

/**
 * Los valores que trae el Excel, como SUGERENCIA para la entrada de datos.
 * No se guardan hasta que los confirmes: son de septiembre de 2026 y pueden
 * estar viejos.
 */
export const PERFIL_SUGERIDO: Perfil = {
  id: 'perfil',
  nombre: '',
  fechaNacimiento: null,
  edad: 22,
  ciudad: 'Santiago, República Dominicana',
  ocupacion: 'Analista comercial y financiero',
  pesoLb: 220,
  estaturaCm: 180,
  pctGrasaEstimado: 0.21,
  factorActividad: 1.55,
  deficitEntreno: 400,
  deficitLigero: 700,
  aguaMetaL: 5,
  estudioMetaMin: 120,
  suenoMetaH: 6.5,
  toleranciaKcal: 150,
  techoKcalAyuno: 200,
  completado: false,
  creadoEn: 0,
}

/** Redondeo de Excel (ROUND): medio hacia arriba en valor absoluto. */
export function redondear(n: number, decimales = 0): number {
  const f = Math.pow(10, decimales)
  return Math.sign(n) * Math.round(Math.abs(n) * f) / f
}

/**
 * Panel de cálculo nutricional — hoja NUTRICION.
 * Con el perfil de arranque devuelve: TMB 2,018 · TDEE 3,128 ·
 * entreno 2,750 · ligero 2,450 · proteína 189 g · grasa 70 g · carbs 341 g.
 */
export function calcularMetas(p: Perfil): MetasDiarias {
  const pesoKg = p.pesoLb / LB_POR_KG
  const masaMagraKg = pesoKg * (1 - p.pctGrasaEstimado)
  const tmb = 10 * pesoKg + 6.25 * p.estaturaCm - 5 * p.edad + 5
  const tdee = tmb * p.factorActividad
  const kcalEntreno = redondear((tdee - p.deficitEntreno) / 50) * 50
  const kcalLigero = redondear((tdee - p.deficitLigero) / 50) * 50
  const proteinaG = redondear(masaMagraKg * 2.4)
  const grasaG = redondear(pesoKg * 0.7)
  return {
    pesoKg,
    masaMagraKg,
    tmb: redondear(tmb),
    tdee: redondear(tdee),
    kcalEntreno,
    kcalLigero,
    kcalAyuno: 0,
    proteinaG,
    grasaG,
    carbsEntrenoG: redondear((kcalEntreno - proteinaG * 4 - grasaG * 9) / 4),
    carbsLigeroG: redondear((kcalLigero - proteinaG * 4 - grasaG * 9) / 4),
  }
}

export function metaDelDia(p: Perfil, tipoDia: TipoDia): MetaDelDia {
  const m = calcularMetas(p)
  const kcal = tipoDia === 'AYUNO' ? m.kcalAyuno : tipoDia === 'LIGERO' ? m.kcalLigero : m.kcalEntreno
  const carbsG = tipoDia === 'AYUNO' ? 0 : tipoDia === 'LIGERO' ? m.carbsLigeroG : m.carbsEntrenoG
  return {
    tipoDia,
    kcal,
    proteinaG: tipoDia === 'AYUNO' ? 0 : m.proteinaG,
    grasaG: tipoDia === 'AYUNO' ? 0 : m.grasaG,
    carbsG,
    aguaL: p.aguaMetaL,
    estudioMin: p.estudioMetaMin,
    suenoH: p.suenoMetaH,
  }
}

/** De dónde salió cada número. Ningún dato de la app aparece sin procedencia. */
export function trazabilidadMetas(p: Perfil): { paso: string; formula: string; valor: string }[] {
  const m = calcularMetas(p)
  const f = (n: number, d = 0) => n.toLocaleString('es-DO', { maximumFractionDigits: d, minimumFractionDigits: d })
  return [
    { paso: 'Peso', formula: `${f(p.pesoLb)} lb ÷ ${LB_POR_KG}`, valor: `${f(m.pesoKg, 1)} kg` },
    {
      paso: 'Masa magra',
      formula: `${f(m.pesoKg, 1)} kg × (1 − ${f(p.pctGrasaEstimado * 100)}% grasa)`,
      valor: `${f(m.masaMagraKg, 1)} kg`,
    },
    {
      paso: 'TMB (Mifflin-St Jeor)',
      formula: `10×${f(m.pesoKg, 1)} + 6.25×${f(p.estaturaCm)} − 5×${f(p.edad)} + 5`,
      valor: `${f(m.tmb)} kcal`,
    },
    { paso: 'TDEE', formula: `TMB × factor ${p.factorActividad}`, valor: `${f(m.tdee)} kcal` },
    {
      paso: 'kcal día ENTRENO',
      formula: `(TDEE − ${f(p.deficitEntreno)} de déficit), redondeado a 50`,
      valor: `${f(m.kcalEntreno)} kcal`,
    },
    {
      paso: 'kcal día LIGERO',
      formula: `(TDEE − ${f(p.deficitLigero)} de déficit), redondeado a 50`,
      valor: `${f(m.kcalLigero)} kcal`,
    },
    { paso: 'kcal día AYUNO', formula: 'Cero por definición: la cena de ruptura cierra el día', valor: '0 kcal' },
    { paso: 'Proteína', formula: `masa magra ${f(m.masaMagraKg, 1)} kg × 2.4 g`, valor: `${f(m.proteinaG)} g` },
    { paso: 'Grasa', formula: `peso ${f(m.pesoKg, 1)} kg × 0.7 g`, valor: `${f(m.grasaG)} g` },
    {
      paso: 'Carbohidratos ENTRENO',
      formula: `(${f(m.kcalEntreno)} − proteína×4 − grasa×9) ÷ 4`,
      valor: `${f(m.carbsEntrenoG)} g`,
    },
    {
      paso: 'Carbohidratos LIGERO',
      formula: `(${f(m.kcalLigero)} − proteína×4 − grasa×9) ÷ 4`,
      valor: `${f(m.carbsLigeroG)} g`,
    },
  ]
}
