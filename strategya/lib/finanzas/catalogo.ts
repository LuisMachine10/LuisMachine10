// Núcleo financiero v2 · CATÁLOGO DE TIPOS y LISTAS CON LÓGICA BANCARIA (manual de lógica financiera
// aprobado por Mena, docs/manual-financiero.md). ÚNICA fuente de estas reglas:
//   · los formularios (Presupuesto y Portafolio) arman sus listas con `aparece` / `cuentasPara`;
//   · la base valida lo mismo en personal.tipo_aparece() (migración 20261029000100_nucleo_v2.sql), escrita a
//     partir de TABLA_SQL de este archivo; una prueba de base compara las dos tabla de verdad completas;
//   · las pruebas (lib/finanzas/catalogo.test.ts) tienen una prueba por regla.
// Puro, sin red. Ninguna cifra.

/** Tipos del registro único (cada fila de «Mis cuentas, activos y deudas» tiene uno). */
export const TIPOS_FIN = [
  "efectivo",
  "corriente",
  "ahorro",
  "alto_rendimiento",
  "certificado",
  "mutuo",
  "bono",
  "fondo_abierto",
  "fondo_cerrado",
  "accion_etf",
  "fideicomiso",
  "tarjeta",
  "prestamo",
  "otra_deuda",
  "bien",
] as const;
export type TipoFin = (typeof TIPOS_FIN)[number];

/** Grupo bancario: de qué lado del balance está y cómo se mueve el dinero. */
export type GrupoFin = "cuenta" | "inversion" | "deuda" | "bien";

/** Cómo rinde (texto del manual) y si capitaliza. «elegible» = lo decide el usuario por instrumento. */
export type Capitaliza = "no_rinde" | "no" | "si" | "elegible" | "implicito" | "renovacion";

/** Clases del motor del Portafolio (personal.activos.clase) que puede tener cada tipo. */
export type ClaseMotor = "efectivo" | "ahorros" | "rentafija" | "rentavariable" | "otros" | "tarjeta" | "prestamo" | "deuda";

export interface ReglaTipo {
  id: TipoFin;
  /** Nombre en pantalla. */
  nom: string;
  /** Cómo rinde, en palabras del manual. */
  rinde: string;
  capitaliza: Capitaliza;
  grupo: GrupoFin;
  /** ¿Sale en «¿Con qué pagaste?»? «debito» = solo si el usuario marca «tiene tarjeta de débito». */
  paga: boolean | "debito";
  /** ¿Puede ser destino de ahorro («¿A dónde va el ahorro?»)? */
  destinoAhorro: boolean;
  /** Retención del interés por defecto (fracción). Editable por instrumento. */
  retencion: string;
  /** Es de puesto de bolsa: no retiene, cobra comisión de administración (opcional; sin ella, «no confirmado»). */
  comisionPuesto: boolean;
  /** ¿Paga intereses, cupones o dividendos a una cuenta del usuario? (siempre o si así lo elige). */
  pagaACuenta: "siempre" | "si_no_capitaliza" | "nunca";
  /** Clases del motor permitidas (la primera es la de una fila nueva). */
  clases: readonly ClaseMotor[];
  /** Subtipo del motor (cuentas de banco y bienes). */
  subtipo?: string;
  /** Ayuda corta para el formulario. */
  ayuda: string;
}

export const CATALOGO: Readonly<Record<TipoFin, ReglaTipo>> = {
  efectivo: {
    id: "efectivo", nom: "Efectivo", rinde: "No rinde", capitaliza: "no_rinde", grupo: "cuenta", paga: true, destinoAhorro: true,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["efectivo"], ayuda: "Billetera o caja de la casa, en cualquier moneda.",
  },
  corriente: {
    id: "corriente", nom: "Cuenta corriente o de nómina", rinde: "No paga interés", capitaliza: "no_rinde", grupo: "cuenta", paga: true, destinoAhorro: false,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["ahorros"], subtipo: "corriente", ayuda: "La cuenta del día a día: de ahí pagas y ahí te cae el sueldo.",
  },
  ahorro: {
    id: "ahorro", nom: "Cuenta de ahorro", rinde: "Interés mínimo: por ahora no se cuenta (tasa 0)", capitaliza: "no", grupo: "cuenta", paga: true, destinoAhorro: true,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["ahorros"], subtipo: "ahorro", ayuda: "Dinero guardado en el banco que puedes sacar cuando quieras.",
  },
  alto_rendimiento: {
    id: "alto_rendimiento", nom: "Cuenta de alto rendimiento", rinde: "Tasa anotada; el interés entra a la misma cuenta", capitaliza: "si", grupo: "cuenta",
    paga: "debito", destinoAhorro: true, retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["ahorros"], subtipo: "alto_rendimiento",
    ayuda: "Cuenta que paga una tasa mayor y te acredita el interés en la misma cuenta.",
  },
  certificado: {
    id: "certificado", nom: "Certificado financiero", rinde: "Tasa fija por plazo", capitaliza: "elegible", grupo: "inversion", paga: false, destinoAhorro: true,
    retencion: "0.10", comisionPuesto: false, pagaACuenta: "si_no_capitaliza", clases: ["rentafija"],
    ayuda: "Depósito a plazo en un banco. Eliges si capitaliza o si te paga los intereses a una cuenta.",
  },
  mutuo: {
    id: "mutuo", nom: "Mutuo o reporto (puesto de bolsa)", rinde: "Tasa por cada plazo (típico 30 días)", capitaliza: "renovacion", grupo: "inversion", paga: false,
    destinoAhorro: true, retencion: "0", comisionPuesto: true, pagaACuenta: "si_no_capitaliza", clases: ["rentafija"],
    ayuda: "No capitaliza solo: al vencer lo renuevas; puedes dejar el interés y aportar más.",
  },
  bono: {
    id: "bono", nom: "Bono", rinde: "Cupón pagado a una cuenta", capitaliza: "no", grupo: "inversion", paga: false, destinoAhorro: true,
    retencion: "0", comisionPuesto: true, pagaACuenta: "siempre", clases: ["rentafija"], ayuda: "Te paga un cupón cada cierto tiempo a una de tus cuentas.",
  },
  fondo_abierto: {
    id: "fondo_abierto", nom: "Fondo abierto", rinde: "Valor cuota", capitaliza: "implicito", grupo: "inversion", paga: false, destinoAhorro: true,
    retencion: "0", comisionPuesto: true, pagaACuenta: "nunca", clases: ["rentafija", "rentavariable"], ayuda: "Tu dinero crece (o baja) con el valor de la cuota.",
  },
  fondo_cerrado: {
    id: "fondo_cerrado", nom: "Fondo cerrado", rinde: "Según su reglamento", capitaliza: "elegible", grupo: "inversion", paga: false, destinoAhorro: true,
    retencion: "0", comisionPuesto: true, pagaACuenta: "si_no_capitaliza", clases: ["rentafija", "rentavariable"],
    ayuda: "Paga o capitaliza según su reglamento: elige cuál es el tuyo.",
  },
  accion_etf: {
    id: "accion_etf", nom: "Acción o ETF", rinde: "Precio + dividendos (pagados a una cuenta)", capitaliza: "no", grupo: "inversion", paga: false, destinoAhorro: true,
    retencion: "0", comisionPuesto: true, pagaACuenta: "siempre", clases: ["rentavariable"], ayuda: "Su precio sube y baja con el mercado; los dividendos te llegan a una cuenta.",
  },
  fideicomiso: {
    id: "fideicomiso", nom: "Fideicomiso", rinde: "Según su contrato", capitaliza: "elegible", grupo: "inversion", paga: false, destinoAhorro: true,
    retencion: "0", comisionPuesto: true, pagaACuenta: "si_no_capitaliza", clases: ["rentafija", "rentavariable"], ayuda: "Paga o capitaliza según su contrato: elige cuál es el tuyo.",
  },
  tarjeta: {
    id: "tarjeta", nom: "Tarjeta de crédito", rinde: "—", capitaliza: "no_rinde", grupo: "deuda", paga: true, destinoAhorro: false,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["tarjeta"], ayuda: "Lo que debes hoy en la tarjeta. Recibe tus abonos.",
  },
  prestamo: {
    id: "prestamo", nom: "Préstamo", rinde: "Cuota (interés + capital)", capitaliza: "no_rinde", grupo: "deuda", paga: false, destinoAhorro: false,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["prestamo"], ayuda: "Carro, casa, personal: lo que te falta por pagar. Recibe tus pagos.",
  },
  otra_deuda: {
    id: "otra_deuda", nom: "Otra deuda", rinde: "—", capitaliza: "no_rinde", grupo: "deuda", paga: false, destinoAhorro: false,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["deuda"], ayuda: "Lo que le debes a alguien y no es tarjeta ni préstamo. Se paga como un préstamo.",
  },
  bien: {
    id: "bien", nom: "Bien (casa, terreno, carro)", rinde: "No rinde", capitaliza: "no_rinde", grupo: "bien", paga: false, destinoAhorro: false,
    retencion: "0", comisionPuesto: false, pagaACuenta: "nunca", clases: ["otros"], ayuda: "Lo que valdría si lo vendieras hoy.",
  },
};

export function esTipoFin(v: unknown): v is TipoFin {
  return typeof v === "string" && (TIPOS_FIN as readonly string[]).includes(v);
}

export const reglaDe = (t: TipoFin): ReglaTipo => CATALOGO[t];

// ───────────────────────── Listas con lógica bancaria ─────────────────────────

/** Formularios del Presupuesto que eligen cuentas. */
export const FORMULARIOS = ["pago", "ingreso", "ahorro", "pago_deuda", "cambio", "rescate"] as const;
export type Formulario = (typeof FORMULARIOS)[number];

/** Papel de la cuenta en el formulario. «cuenta» = formularios de una sola cuenta (pago, ingreso). */
export type Rol = "cuenta" | "origen" | "destino";

/** Papeles que tiene cada formulario. */
export const ROLES: Readonly<Record<Formulario, readonly Rol[]>> = {
  pago: ["cuenta"],
  ingreso: ["cuenta"],
  ahorro: ["origen", "destino"],
  pago_deuda: ["origen", "destino"],
  cambio: ["origen", "destino"],
  rescate: ["origen", "destino"],
};

/** Etiqueta de cada formulario y papel (la que ve el usuario). */
export const PREGUNTA: Readonly<Record<Formulario, Partial<Record<Rol, string>>>> = {
  pago: { cuenta: "¿Con qué pagaste?" },
  ingreso: { cuenta: "¿A qué cuenta entra?" },
  ahorro: { origen: "¿De dónde sale el dinero?", destino: "¿A dónde va el ahorro?" },
  pago_deuda: { origen: "¿De dónde sale el pago?", destino: "Tarjeta o préstamo que pagas" },
  cambio: { origen: "Sale de (una moneda)", destino: "Entra a (otra moneda)" },
  rescate: { origen: "Inversión que rescatas o vendes", destino: "¿A qué cuenta entra el dinero?" },
};

/** Lo que el formulario necesita saber de una fila para decidir. */
export interface FilaCatalogo {
  tipo: TipoFin;
  /** Solo alto rendimiento: ¿tiene tarjeta de débito? */
  debito?: boolean | null;
}

/**
 * ¿La fila aparece en ese formulario, en ese papel? Es la tabla de verdad del manual (sección B):
 *   ¿Con qué pagaste? → efectivo, corriente, ahorro, alto rendimiento con débito, tarjetas.
 *   ¿A qué cuenta entra? → efectivo y cuentas (corriente, ahorro, alto rendimiento).
 *   ¿A dónde va el ahorro? → todo tipo con «Destino de ahorro = sí» (sale de efectivo o cuentas).
 *   Pago de tarjeta o préstamo → sale de efectivo o cuentas; va a tarjetas y préstamos.
 *   Cambio de moneda → efectivo y cuentas (de las dos monedas).
 *   Rescate o venta de inversión → sale de una inversión; va a efectivo o una cuenta.
 * Una inversión nunca sale en «¿Con qué pagaste?»: para gastar de ella primero se rescata a una cuenta.
 */
export function aparece(f: FilaCatalogo, formulario: Formulario, rol: Rol): boolean {
  const r = CATALOGO[f.tipo];
  const cuenta = r.grupo === "cuenta";
  switch (formulario) {
    case "pago":
      return rol === "cuenta" && (r.paga === true || (r.paga === "debito" && f.debito === true));
    case "ingreso":
      return rol === "cuenta" && cuenta;
    case "ahorro":
      return rol === "origen" ? cuenta : rol === "destino" && r.destinoAhorro;
    case "pago_deuda":
      return rol === "origen" ? cuenta : rol === "destino" && (f.tipo === "tarjeta" || f.tipo === "prestamo" || f.tipo === "otra_deuda");
    case "cambio":
      return (rol === "origen" || rol === "destino") && cuenta;
    case "rescate":
      return rol === "origen" ? r.grupo === "inversion" : rol === "destino" && cuenta;
  }
}

/** Filtra una lista con la regla del formulario. */
export function cuentasPara<T extends FilaCatalogo>(filas: readonly T[], formulario: Formulario, rol: Rol): T[] {
  return filas.filter((f) => aparece(f, formulario, rol));
}

/**
 * Tabla de verdad completa (tipo × débito × formulario × papel) para la función SQL personal.tipo_aparece y la
 * prueba que las compara. Solo los «sí» (lo demás es «no»).
 */
export function tablaDeVerdad(): { tipo: TipoFin; debito: boolean; formulario: Formulario; rol: Rol }[] {
  const out: { tipo: TipoFin; debito: boolean; formulario: Formulario; rol: Rol }[] = [];
  for (const tipo of TIPOS_FIN)
    for (const debito of [false, true])
      for (const formulario of FORMULARIOS) for (const rol of ROLES[formulario]) if (aparece({ tipo, debito }, formulario, rol)) out.push({ tipo, debito, formulario, rol });
  return out;
}

// ───────────────────────── Reglas de comportamiento ─────────────────────────

/** ¿Es una inversión? (nunca paga: para gastar, rescate o venta hacia una cuenta). */
export const esInversionFin = (t: TipoFin) => CATALOGO[t].grupo === "inversion";
export const esCuentaFin = (t: TipoFin) => CATALOGO[t].grupo === "cuenta";
export const esDeudaFin = (t: TipoFin) => CATALOGO[t].grupo === "deuda";

/** ¿El Presupuesto la usa sola (se enlaza sin pedirlo)? Cuentas y deudas siempre; inversiones de saldo (precio 1) también. */
export function seEnlazaSola(t: TipoFin, precioEsUno: boolean): boolean {
  const g = CATALOGO[t].grupo;
  if (g === "cuenta" || g === "deuda") return true;
  return g === "inversion" && precioEsUno && t !== "accion_etf";
}

/** ¿Capitaliza este instrumento? null = falta que el usuario elija (tipos elegibles sin elegir). */
export function capitalizaDe(t: TipoFin, elegido: boolean | null | undefined): boolean | null {
  const c = CATALOGO[t].capitaliza;
  if (c === "si" || c === "implicito") return true;
  if (c === "elegible") return elegido ?? null;
  return false;
}

/** ¿Tasa que cuenta? La cuenta de ahorro por ahora no cuenta su interés mínimo (tasa 0). */
export function tasaQueCuenta(t: TipoFin, tasa: string): string {
  const c = CATALOGO[t].capitaliza;
  if (t === "ahorro" || c === "no_rinde") return "0";
  return tasa;
}

/** Retención vigente: la escrita en el instrumento o la del tipo. */
export function retencionDe(t: TipoFin, escrita: string | null | undefined): string {
  return escrita !== null && escrita !== undefined && escrita !== "" ? escrita : CATALOGO[t].retencion;
}

/** ¿Este instrumento manda sus cobros (interés, cupón, dividendo) a una cuenta? */
export function pagaACuenta(t: TipoFin, capitaliza: boolean | null): boolean {
  const p = CATALOGO[t].pagaACuenta;
  return p === "siempre" || (p === "si_no_capitaliza" && capitaliza === false);
}

/** La cuenta que recibe cobros debe ser efectivo o una cuenta de banco. */
export const puedeRecibirCobros = (t: TipoFin) => CATALOGO[t].grupo === "cuenta";

/**
 * Tipo de una fila que ya existía (antes de este catálogo), sin adivinar de más: clase y subtipo deciden; en renta
 * fija y variable se mira el nombre (palabras «mutuo», «bono», «fondo»…). `seguro` = false cuando hubo que suponer:
 * la pantalla pide confirmarlo. La migración SQL usa la misma regla (personal.tipo_inicial).
 */
export function tipoInicial(f: { clase: string; subtipo: string | null; nombre: string; institucion?: string; simbolo?: string | null; tipoRF?: string | null; tasa?: string }): {
  tipo: TipoFin;
  seguro: boolean;
} {
  const t = `${f.nombre} ${f.institucion ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  switch (f.clase) {
    case "efectivo":
      return { tipo: "efectivo", seguro: true };
    case "tarjeta":
      return { tipo: "tarjeta", seguro: true };
    case "prestamo":
      return { tipo: "prestamo", seguro: true };
    case "deuda":
      return { tipo: "otra_deuda", seguro: true };
    case "otros":
      return { tipo: "bien", seguro: true };
    case "ahorros":
      if (f.subtipo === "corriente") return { tipo: "corriente", seguro: true };
      if (f.subtipo === "alto_rendimiento" || /alto\s*rendimiento/.test(t)) return { tipo: "alto_rendimiento", seguro: f.subtipo === "alto_rendimiento" };
      // Sin subtipo, una cuenta del Portafolio se lleva como ahorro (así la trataba el Presupuesto): se pide confirmar.
      return { tipo: "ahorro", seguro: f.subtipo === "ahorro" };
    case "rentafija":
      if (/mutuo|reporto/.test(t)) return { tipo: "mutuo", seguro: false };
      if (/\bbonos?\b/.test(t)) return { tipo: "bono", seguro: false };
      if (/fideicomiso/.test(t)) return { tipo: "fideicomiso", seguro: false };
      if (/fondo/.test(t)) return { tipo: /cerrado/.test(t) ? "fondo_cerrado" : "fondo_abierto", seguro: false };
      if (/certificado|deposito a plazo|\bcd\b/.test(t)) return { tipo: "certificado", seguro: false };
      return { tipo: f.tipoRF === "cupon" ? "bono" : "certificado", seguro: false };
    case "rentavariable":
      if (/fideicomiso/.test(t)) return { tipo: "fideicomiso", seguro: false };
      if (/fondo/.test(t)) return { tipo: /cerrado/.test(t) ? "fondo_cerrado" : "fondo_abierto", seguro: false };
      return { tipo: "accion_etf", seguro: !!f.simbolo };
    default:
      return { tipo: "bien", seguro: false };
  }
}

/** Clase y subtipo del motor para una fila de ese tipo (la clase elegida si es válida para el tipo). */
export function claseDeTipo(t: TipoFin, clasePedida?: string | null): { clase: ClaseMotor; subtipo: string | null } {
  const r = CATALOGO[t];
  const clase = clasePedida && (r.clases as readonly string[]).includes(clasePedida) ? (clasePedida as ClaseMotor) : r.clases[0];
  return { clase, subtipo: r.subtipo ?? (clase === "otros" ? "otro" : null) };
}

/** Tipos en el orden del formulario «¿Qué es?», agrupados. */
export const GRUPOS_ALTA: readonly { nom: string; tipos: readonly TipoFin[] }[] = [
  { nom: "Efectivo y cuentas", tipos: ["efectivo", "corriente", "ahorro", "alto_rendimiento"] },
  { nom: "Inversiones", tipos: ["certificado", "mutuo", "bono", "fondo_abierto", "fondo_cerrado", "accion_etf", "fideicomiso"] },
  { nom: "Bienes", tipos: ["bien"] },
  { nom: "Lo que debes", tipos: ["tarjeta", "prestamo", "otra_deuda"] },
];

// ───────────────────────── Validación de un movimiento (igual que la base) ─────────────────────────

/** Una cuenta o fila con su nombre, para los mensajes. null = no se conoce (la base tampoco la revisa). */
export type FilaNombrada = (FilaCatalogo & { nombre: string }) | null;

/** Como personal.nombre_tipo_fin (los mensajes de la base y de la pantalla dicen lo mismo). */
export const NOMBRE_CORTO: Readonly<Record<TipoFin, string>> = {
  efectivo: "efectivo", corriente: "cuenta corriente", ahorro: "cuenta de ahorro", alto_rendimiento: "cuenta de alto rendimiento",
  certificado: "certificado", mutuo: "mutuo o reporto", bono: "bono", fondo_abierto: "fondo abierto", fondo_cerrado: "fondo cerrado",
  accion_etf: "acción o ETF", fideicomiso: "fideicomiso", tarjeta: "tarjeta de crédito", prestamo: "préstamo", otra_deuda: "deuda", bien: "bien",
};
const ok = (f: FilaNombrada, formulario: Formulario, rol: Rol) => f === null || aparece(f, formulario, rol);
const grupo = (f: FilaNombrada): GrupoFin | null => (f ? CATALOGO[f.tipo].grupo : null);

/**
 * ¿El movimiento respeta las listas del manual? Devuelve el error en palabras simples o null. Es la MISMA regla del
 * trigger personal.caja_validar_cuentas (la prueba de base compara las dos con todas las combinaciones).
 * `tipo`: ingreso | gasto | transferencia | pago_tarjeta. En una transferencia: si sale de una inversión es un
 * rescate (va a efectivo o una cuenta); si va a una inversión es un ahorro (sale de efectivo o una cuenta); entre
 * cuentas es mover o cambiar moneda. Las tarjetas y préstamos solo se pagan con «Pago de tarjeta o préstamo».
 */
export function errorDeCuentas(tipo: string, origen: FilaNombrada, destino: FilaNombrada): string | null {
  if (tipo === "gasto") {
    if (ok(origen, "pago", "cuenta")) return null;
    const o = origen!;
    if (grupo(o) === "inversion") return `«${o.nombre}» es una inversión: una inversión nunca se usa para pagar. Para gastar de ella, registra primero «Rescate o venta» hacia una cuenta.`;
    if (o.tipo === "alto_rendimiento") return `«${o.nombre}» no tiene tarjeta de débito marcada: no sirve para pagar. Márcala en Mis cuentas o paga desde otra cuenta.`;
    return `«${o.nombre}» (${NOMBRE_CORTO[o.tipo]}) no sirve para pagar: paga con efectivo, una cuenta o una tarjeta.`;
  }
  if (tipo === "ingreso") {
    return ok(origen, "ingreso", "cuenta") ? null : `«${origen!.nombre}» (${NOMBRE_CORTO[origen!.tipo]}) no recibe ingresos: el dinero entra a efectivo o a una cuenta.`;
  }
  if (tipo === "pago_tarjeta") {
    if (!ok(origen, "pago_deuda", "origen")) return `Un pago de tarjeta o préstamo sale de efectivo o de una cuenta, no de «${origen!.nombre}» (${NOMBRE_CORTO[origen!.tipo]}).`;
    if (!ok(destino, "pago_deuda", "destino")) return `«${destino!.nombre}» no es una tarjeta ni un préstamo: para mover dinero usa «Mover entre mis cuentas».`;
    return null;
  }
  if (tipo === "transferencia") {
    if (grupo(origen) === "inversion") {
      return ok(destino, "rescate", "destino") ? null : `El dinero de un rescate o venta va a efectivo o a una cuenta, no a «${destino!.nombre}» (${NOMBRE_CORTO[destino!.tipo]}).`;
    }
    if (grupo(destino) === "inversion") {
      return ok(origen, "ahorro", "origen") ? null : `El ahorro sale de efectivo o de una cuenta, no de «${origen!.nombre}» (${NOMBRE_CORTO[origen!.tipo]}).`;
    }
    if (grupo(origen) === "deuda" || grupo(destino) === "deuda") return "Para pagar una tarjeta o un préstamo usa «Pago de tarjeta o préstamo»; para gastar con la tarjeta, «Gasto».";
    if (grupo(origen) === "bien" || grupo(destino) === "bien") return "Un bien (casa, terreno, carro) no mueve dinero en el Presupuesto.";
  }
  return null;
}

/** Qué formulario es una transferencia según sus cuentas (para la pantalla y los textos). */
export function formularioDeTransferencia(
  origen: FilaCatalogo | null,
  destino: FilaCatalogo | null,
  monedaOrigen?: string,
  monedaDestino?: string,
): "rescate" | "ahorro" | "cambio" | "mover" {
  if (origen && CATALOGO[origen.tipo].grupo === "inversion") return "rescate";
  if (destino && CATALOGO[destino.tipo].grupo === "inversion") return "ahorro";
  if (monedaOrigen && monedaDestino && monedaOrigen !== monedaDestino) return "cambio";
  return "mover";
}
