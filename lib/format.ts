const nfCompleto = new Intl.NumberFormat("es-CL");
const nfCompacto = new Intl.NumberFormat("es-CL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// 1234567 -> "1.234.567"
export const fmt = (n: number): string => nfCompleto.format(n);

// 1234567 -> "1,2 M" (para ejes)
export const fmtCompacto = (n: number): string => nfCompacto.format(n);
