// Guía de uso de Strategya: preguntas y respuestas cortas, agrupadas por pantalla.
// Se muestra en /ayuda (con buscador) y se llega desde Ajustes. Lenguaje de la calle; sin jerga.

export interface Pregunta {
  p: string;
  r: string;
}

export interface GrupoGuia {
  id: string;
  pantalla: string;
  href: string | null;
  preguntas: Pregunta[];
}

export const GUIA: GrupoGuia[] = [
  {
    id: "general",
    pantalla: "Para empezar",
    href: null,
    preguntas: [
      { p: "¿Qué es Strategya?", r: "Tu resumen financiero en un solo lugar: los mercados del mundo, la República Dominicana y tu dinero. Lo informativo se actualiza solo; tu presupuesto y tu portafolio los anotas tú." },
      { p: "¿De dónde salen las cifras?", r: "De fuentes oficiales y públicas: Banco Central, Hacienda, Tesoro de EE. UU., la Fed, el BCE, Cboe, FRED y las administradoras de fondos. Cada cifra muestra su fuente con enlace. Ninguna sale de una inteligencia artificial." },
      { p: "¿Cómo leo una cifra?", r: "La cifra grande es el último valor. La pastilla de color dice cuánto se movió: verde sube (a favor), rojo baja (en contra), gris sin cambio. Debajo, en pequeño, la fuente, la fecha del dato y hace cuánto se revisó." },
      { p: "¿Qué significa «dato viejo»?", r: "Que la fuente no ha publicado en su horario normal. Ves la última cifra buena, con su fecha. No tienes que hacer nada; si quieres saber por qué, mira «Estado de las fuentes»." },
      { p: "¿Qué significa «sin dato»?", r: "Que la cifra no llegó todavía. Strategya nunca la inventa ni la rellena: la tarjeta dice el motivo y cuándo suele llegar." },
      { p: "¿Strategya me dice qué comprar o vender?", r: "No. Es una herramienta de información, no asesoría de inversión. Te muestra los datos y su porqué para que tú decidas." },
      { p: "¿Cada cuánto se actualiza?", r: "Los precios de mercado cada 5 minutos con la bolsa abierta; el dólar del Banco Central dos veces al día; las noticias cada 10 a 30 minutos. La página se refresca sola cada minuto." },
      { p: "¿Cómo salgo de mi sesión?", r: "Con «Salir», arriba a la derecha. En el celular está dentro de «Más»." },
    ],
  },
  {
    id: "dashboard",
    pantalla: "Dashboard",
    href: "/",
    preguntas: [
      { p: "¿Qué es el Dashboard?", r: "Tu portada, armada a tu gusto con tarjetas (widgets): cifras del día, tus noticias, tu presupuesto, tu portafolio, la curva del Tesoro, el dólar, combustibles, fondos y la agenda." },
      { p: "¿Cómo muevo una tarjeta?", r: "Pulsa «Editar mi dashboard». Arrastra la tarjeta por su asa (los seis puntitos) o usa las flechas ↑ y ↓. Con el teclado: Tab hasta el asa, Espacio para tomarla, flechas para moverla y Espacio para soltarla. Al terminar pulsa «Listo»." },
      { p: "¿Cómo cambio el tamaño de una tarjeta?", r: "En modo edición, cada tarjeta tiene tres botones: S (un tercio del ancho), M (dos tercios) y L (todo el ancho). En el celular todas ocupan el ancho completo." },
      { p: "¿Cómo oculto o vuelvo a mostrar una tarjeta?", r: "En modo edición, el botón del ojo tachado la oculta. Abajo, en «Agregar tarjetas», están las ocultas: pulsa «Agregar» y aparece al final." },
      { p: "Me equivoqué editando, ¿cómo vuelvo atrás?", r: "«Cancelar» deja todo como estaba antes de editar. «Volver al de fábrica» pone la disposición original de Strategya." },
      { p: "¿Dónde se guarda cómo lo ordené?", r: "En tu cuenta, en la base de datos. Lo verás igual en el celular y en la computadora." },
      { p: "¿Cómo elijo «Mis noticias»?", r: "En la tarjeta «Mis noticias» pulsa «Elegir mis noticias» (o «Cambiar filtro»). Marca temas y medios, o escribe palabras clave separadas por comas (Ej.: petróleo, Banco Central). Solo se muestran titulares ya guardados que coincidan." },
      { p: "Una tarjeta se ve pequeña y dice «Sin dato»", r: "Es a propósito: cuando no hay datos, la tarjeta se encoge y dice por qué, en vez de ocupar una caja vacía. Cuando llegue el dato, se llena sola." },
    ],
  },
  {
    id: "news",
    pantalla: "News",
    href: "/news",
    preguntas: [
      { p: "¿Qué hay en News?", r: "Cómo amaneció el día en una sola página: «Hoy en 30 segundos», las 6 cifras clave, alertas, mercados, RD, el mundo y el resumen de tu dinero." },
      { p: "¿Qué es «Hoy en 30 segundos»?", r: "Tres o cuatro frases simples armadas solo con las cifras guardadas (bolsa, oro, petróleo, dólar). Si falta una cifra, su frase no sale." },
      { p: "¿Dónde veo todos los titulares?", r: "En News, pulsa «Todos los titulares». Ahí están por tema, con la agenda, los comunicados de bancos centrales y las fusiones y salidas a bolsa." },
      { p: "¿Por qué solo veo el titular y no la noticia completa?", r: "Strategya guarda solo el titular y el enlace. Al tocarlo, se abre la noticia en el sitio del medio." },
    ],
  },
  {
    id: "mercados",
    pantalla: "Mercados",
    href: "/mercado",
    preguntas: [
      { p: "¿Qué veo en Mercados?", r: "Bolsas del mundo, oro y metales, petróleo y gas, tasas de interés y monedas. Cuando algo se mueve fuerte aparece una línea con el porqué, basada en titulares reales." },
      { p: "Dice «Cierre del vie…», ¿está mal?", r: "No: el mercado está cerrado y ves el último cierre." },
      { p: "¿Qué es la curva del Tesoro?", r: "Lo que paga el Gobierno de EE. UU. por prestarle dinero a distintos plazos, de 1 mes a 30 años. Si los plazos cortos pagan más que los largos (curva invertida), el mercado suele esperar una economía más lenta." },
    ],
  },
  {
    id: "rd",
    pantalla: "RD",
    href: "/rd",
    preguntas: [
      { p: "¿Qué dólar es el que muestra Strategya?", r: "La tasa de referencia del Banco Central (compra y venta). Los bancos y casas de cambio pueden cobrar un poco distinto." },
      { p: "¿Qué es la tasa de política monetaria (TPM)?", r: "La tasa que fija el Banco Central para guiar lo que cobran y pagan los bancos. Si sube, los préstamos tienden a encarecerse." },
      { p: "¿De dónde salen los fondos de inversión?", r: "De lo que publican las administradoras de fondos (SAFI). Si una no se puede leer sola, se carga a mano en «Agregar un dato», siempre con su enlace." },
      { p: "¿Cuándo cambian los combustibles?", r: "El Ministerio de Industria y Comercio (MICM) publica los precios cada viernes para la semana siguiente." },
    ],
  },
  {
    id: "portafolio",
    pantalla: "Portafolio Financiero",
    href: "/capital",
    preguntas: [
      { p: "¿Qué hago en Portafolio Financiero?", r: "Anotas tus inversiones (o importas tu archivo) y ves cuánto tienes, cuánto ganaste en el mes y cómo está repartido en 4 clases: efectivo, cuentas de ahorro, renta fija y renta variable." },
      { p: "¿Qué es el fondo de emergencia en meses?", r: "Cuántos meses de gastos podrías cubrir solo con tu dinero líquido (efectivo y ahorros)." },
      { p: "¿Qué es la Política de inversión (IPS)?", r: "Un documento corto donde escribes tus metas, tu horizonte y cuánto riesgo aceptas. Strategya lo usa para avisarte si algo se sale de lo que tú decidiste." },
      { p: "¿Tengo que poner números de cuenta?", r: "Nunca. Basta un nombre que reconozcas, por ejemplo «Ahorro Popular». Solo tú ves estos datos." },
    ],
  },
  {
    id: "presupuesto",
    pantalla: "Presupuesto",
    href: "/caja",
    preguntas: [
      { p: "¿Qué hago en Presupuesto?", r: "Anotas tus cuentas, tu sueldo y tus pagos fijos una vez, y el calendario calcula cuánto puedes gastar hoy sin quedarte corto antes del próximo ingreso." },
      { p: "¿Qué es el colchón?", r: "Un monto mínimo que no quieres tocar nunca. «Puedes gastar hasta…» ya lo descuenta." },
      { p: "¿Cómo empiezo?", r: "La primera vez, un asistente te guía en 4 pasos. Puedes empezar con una sola cuenta y un pago fijo y completar lo demás luego." },
      { p: "¿Qué pasa si un pago fijo no se hizo?", r: "En el calendario, tócalo y márcalo como hecho, cámbialo o sáltalo. Así el saldo sigue siendo real." },
    ],
  },
  {
    id: "mapa",
    pantalla: "Mapa",
    href: "/globo",
    preguntas: [
      { p: "¿Qué muestra el Mapa?", r: "Un globo 3D con bolsas, conflictos, rutas de barcos, sismos y huracanes que pueden mover precios. Toca un punto para ver su tarjeta." },
      { p: "El globo no carga", r: "Necesita una conexión estable y un navegador con 3D (WebGL). Si no carga, verás el mismo contenido como lista." },
    ],
  },
  {
    id: "alertas",
    pantalla: "Alertas y ajustes",
    href: "/ajustes",
    preguntas: [
      { p: "¿Cómo pongo una alerta?", r: "En «Más → Ajustes y alertas», escribe el número que te importa para cada activo (por ejemplo, oro: avisar si se mueve más de 2 %) y pulsa «Guardar»." },
      { p: "¿Qué es un umbral?", r: "El límite que tú eliges. Si la cifra lo cruza, Strategya te avisa: arriba en la pantalla y, si lo activaste, por correo." },
      { p: "¿Cuántas alertas llegan?", r: "Como máximo una por activo y por día, para no llenarte de avisos." },
    ],
  },
  {
    id: "fuentes",
    pantalla: "Fuentes y datos",
    href: "/estado",
    preguntas: [
      { p: "¿Qué es «Estado de las fuentes»?", r: "La lista de cada lectura automática (corrida) con su último resultado: bien, parcial o con error, y el motivo en palabras simples." },
      { p: "Una fuente dice error, ¿qué hago?", r: "Normalmente nada: Strategya lo vuelve a intentar sola. Si una fuente bloquea la lectura, no se fuerza: el dato pasa a carga manual." },
      { p: "¿Cómo agrego un dato a mano?", r: "En «Más → Agregar un dato» eliges la cifra, escribes el valor, la fecha y el enlace oficial de donde la sacaste. Sin enlace no se guarda." },
    ],
  },
];
