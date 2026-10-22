// Ilustraciones vectoriales de la bienvenida (una por paso). Solo formas: sin cifras ni datos.
// Los colores salen del tema (app/globals.css) y cada pieza entra con una pequeña animación (estilos/ayuda.css).

const ANCHO = 320;
const ALTO = 150;

function Lienzo({ children }: { children: React.ReactNode }) {
  return (
    <svg className="bv-ilus" viewBox={`0 0 ${ANCHO} ${ALTO}`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Paso 1: el Dashboard como tarjetas que se pueden mover. */
export function IlustracionDashboard() {
  return (
    <Lienzo>
      <g>
        <rect x="20" y="16" width="134" height="76" rx="8" className="bv-tarjeta bv-tarjeta-oro" />
        <rect x="32" y="28" width="44" height="5" rx="2.5" className="bv-linea" />
        <path d="M32 78 L48 70 L60 73 L74 60 L88 64 L102 52 L116 56 L130 44 L142 46 L142 84 L32 84 Z" className="bv-area" />
        <path d="M32 78 L48 70 L60 73 L74 60 L88 64 L102 52 L116 56 L130 44 L142 46" className="bv-trazo" />
      </g>
      <g>
        <rect x="164" y="16" width="136" height="34" rx="8" className="bv-tarjeta" />
        <rect x="176" y="27" width="60" height="5" rx="2.5" className="bv-linea" />
        <rect x="176" y="37" width="96" height="4" rx="2" className="bv-linea bv-tenue" />
      </g>
      <g>
        <rect x="164" y="58" width="64" height="34" rx="8" className="bv-tarjeta" />
        <rect x="176" y="78" width="7" height="8" rx="1.5" className="bv-sube" />
        <rect x="187" y="72" width="7" height="14" rx="1.5" className="bv-sube" />
        <rect x="198" y="68" width="7" height="18" rx="1.5" className="bv-sube" />
        <rect x="209" y="75" width="7" height="11" rx="1.5" className="bv-baja" />
      </g>
      <g className="bv-movida">
        <rect x="240" y="64" width="64" height="34" rx="8" className="bv-tarjeta bv-arrastre" />
        <circle cx="262" cy="81" r="9" className="bv-anillo" />
        <path d="M262 72 A9 9 0 0 1 271 81" className="bv-anillo-oro" />
        <rect x="277" y="76" width="18" height="4" rx="2" className="bv-linea" />
        <rect x="277" y="84" width="12" height="4" rx="2" className="bv-linea bv-tenue" />
      </g>
      <g>
        <rect x="20" y="100" width="280" height="34" rx="8" className="bv-tarjeta" />
        <circle cx="36" cy="117" r="4" className="bv-punto-oro" />
        <rect x="48" y="114" width="150" height="6" rx="3" className="bv-linea" />
        <rect x="246" y="110" width="42" height="14" rx="4" className="bv-pastilla-sube" />
      </g>
    </Lienzo>
  );
}

/** Paso 2: cómo se lee una cifra (grande, pastilla, fuente y fecha). */
export function IlustracionCifra() {
  return (
    <Lienzo>
      <g>
        <rect x="44" y="12" width="232" height="126" rx="10" className="bv-tarjeta bv-tarjeta-oro" />
        <rect x="62" y="30" width="72" height="6" rx="3" className="bv-linea bv-tenue" />
      </g>
      <g>
        <rect x="62" y="46" width="112" height="22" rx="4" className="bv-cifra" />
      </g>
      <g>
        <rect x="186" y="47" width="72" height="20" rx="5" className="bv-pastilla-sube" />
        <path d="M197 61 L202 53 L207 61 Z" className="bv-sube" />
        <rect x="213" y="54" width="34" height="6" rx="3" className="bv-sube" />
      </g>
      <g>
        <path d="M62 112 L82 104 L98 108 L116 96 L134 100 L152 88 L172 92 L192 80 L214 84 L236 74 L258 78" className="bv-trazo bv-trazo-sube" />
      </g>
      <g>
        <circle cx="66" cy="126" r="2.5" className="bv-punto-oro" />
        <rect x="74" y="123.5" width="58" height="5" rx="2.5" className="bv-linea bv-tenue" />
        <rect x="138" y="123.5" width="34" height="5" rx="2.5" className="bv-linea bv-tenue" />
      </g>
    </Lienzo>
  );
}

/** Paso 3: tu dinero (reparto del portafolio y lista privada). */
export function IlustracionDinero() {
  const r = 38;
  const c = 2 * Math.PI * r;
  const tramos = [
    { parte: 0.42, clase: "bv-dona-oro" },
    { parte: 0.26, clase: "bv-dona-rd" },
    { parte: 0.2, clase: "bv-dona-sube" },
    { parte: 0.12, clase: "bv-dona-gris" },
  ];
  let acumulado = 0;
  return (
    <Lienzo>
      <g>
        <circle cx="86" cy="76" r={r} className="bv-dona-fondo" />
        {tramos.map((t) => {
          const largo = t.parte * c;
          const desfase = -acumulado * c;
          acumulado += t.parte;
          return (
            <circle
              key={t.clase}
              cx="86"
              cy="76"
              r={r}
              className={`bv-dona ${t.clase}`}
              strokeDasharray={`${Math.max(largo - 2, 0)} ${c}`}
              strokeDashoffset={desfase}
              transform="rotate(-90 86 76)"
            />
          );
        })}
        <rect x="70" y="72" width="32" height="8" rx="3" className="bv-cifra" />
      </g>
      <g>
        <rect x="150" y="34" width="150" height="26" rx="6" className="bv-tarjeta" />
        <rect x="160" y="44" width="7" height="7" rx="2" className="bv-cuadro-oro" />
        <rect x="174" y="45" width="56" height="5" rx="2.5" className="bv-linea" />
        <rect x="262" y="45" width="28" height="5" rx="2.5" className="bv-linea bv-tenue" />
      </g>
      <g>
        <rect x="150" y="64" width="150" height="26" rx="6" className="bv-tarjeta" />
        <rect x="160" y="74" width="7" height="7" rx="2" className="bv-cuadro-rd" />
        <rect x="174" y="75" width="44" height="5" rx="2.5" className="bv-linea" />
        <rect x="262" y="75" width="28" height="5" rx="2.5" className="bv-linea bv-tenue" />
      </g>
      <g>
        <rect x="150" y="94" width="150" height="26" rx="6" className="bv-tarjeta" />
        <rect x="160" y="104" width="7" height="7" rx="2" className="bv-cuadro-sube" />
        <rect x="174" y="105" width="62" height="5" rx="2.5" className="bv-linea" />
        <rect x="262" y="105" width="28" height="5" rx="2.5" className="bv-linea bv-tenue" />
      </g>
      <g>
        <circle cx="290" cy="20" r="12" className="bv-candado-fondo" />
        <path d="M284.5 20h11v8h-11zM287 20v-3a3 3 0 0 1 6 0v3" className="bv-candado" />
      </g>
    </Lienzo>
  );
}
