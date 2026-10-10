import { Instrument_Serif } from "next/font/google";

// Spec 012: tipografia de titulos de la pagina publica (serif itálica, como las
// historias del estudio). Solo se carga en /s/*.
const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display"
});

export default function PublicStudioLayout({ children }: { children: React.ReactNode }) {
  return <div className={display.variable}>{children}</div>;
}
