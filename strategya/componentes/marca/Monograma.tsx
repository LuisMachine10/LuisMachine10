// Isotipo de Strategya: un sello redondo con doble filete y la «S» cursiva de Newsreader (OFL) convertida
// en trazado, para que se vea igual sin cargar la fuente. Los colores salen de --marca-sello y --marca-oro.
// El mismo dibujo, en archivo, es el ícono de la pestaña: public/icono.svg.

export const S_CURSIVA =
  "M1055.2 1256.8Q1008.8 1321.6 934 1360.9Q859.2 1400.2 760.6 1400.2Q666.6 1400.2 600.4 1370.3Q534.2 1340.4 499.3 1283.8Q464.4 1227.2 464.4 1147.6Q464.4 1069 499.8 1016.9Q535.2 964.8 591.9 927.2Q648.6 889.6 713 852.4Q777.4 815.4 841.6 768.3Q905.8 721.2 948.7 647.6Q991.6 574 991.6 455.8Q991.6 317.2 919.6 209Q847.6 100.8 714.8 39.4Q582 -22 398.8 -22Q296 -22 207 -6.4Q118 9.2 45.6 39.6L43.6 422.8H73.2L218.4 22.2L122.6 119.6Q187 75.8 250.2 51.1Q313.4 26.4 401.8 26.4Q524 26.4 612.8 63.4Q701.6 100.4 749.3 174.2Q797 248 797 357.8Q797 433.2 769.9 484.5Q742.8 535.8 698.9 571.8Q655 607.8 604.5 635.3Q554 662.8 508 690.4Q446.4 727.8 397.1 771.2Q347.8 814.6 319.2 877Q290.6 939.4 290.6 1032Q290.6 1157 351.9 1251.3Q413.2 1345.6 525.4 1398.8Q637.6 1452 788.8 1452Q893 1452 978.2 1425.2Q1063.4 1398.4 1149.8 1343.8L1028.4 1376L1161.6 1489.4H1177.6L1129.2 1013.2H1104.8L1012.4 1346.2Z";

export function Monograma({ tamano = 28, className }: { tamano?: number; className?: string }) {
  return (
    <svg
      className={className ? `monograma ${className}` : "monograma"}
      width={tamano}
      height={tamano}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="15.4" fill="var(--marca-sello)" />
      <circle cx="16" cy="16" r="14.6" fill="none" stroke="var(--marca-oro)" strokeOpacity="0.75" strokeWidth="0.7" />
      {tamano >= 40 ? (
        <circle cx="16" cy="16" r="13.1" fill="none" stroke="var(--marca-oro)" strokeOpacity="0.3" strokeWidth="0.4" />
      ) : null}
      <path transform="translate(9.5 23.8) scale(0.01058 -0.01058)" fill="var(--marca-oro)" d={S_CURSIVA} />
    </svg>
  );
}

/** Logotipo completo: sello + nombre en la serif de la marca. */
export function Logotipo({ tamano = 28 }: { tamano?: number }) {
  return (
    <>
      <Monograma tamano={tamano} />
      <span className="marca-nombre">Strategya</span>
    </>
  );
}
