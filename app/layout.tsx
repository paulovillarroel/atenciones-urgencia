import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// URL pública del sitio (para las tarjetas sociales, que exigen URLs absolutas).
// Ajustar si el repo/usuario cambia (página de proyecto: <usuario>.github.io/<repo>).
const SITIO = "https://paulovillarroel.github.io/atenciones-urgencia";
const DESCRIPCION =
  "Compara atenciones y hospitalizaciones de urgencia por causas respiratorias en Chile, por semana epidemiológica: por año, región, servicio de salud, comuna, grupo etario y causa (CIE-10), con tasas por 100.000 hab. Datos abiertos del DEIS, actualizados a diario.";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: "Urgencias respiratorias en Chile",
  description: DESCRIPCION,
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: `${SITIO}/`,
    siteName: "Urgencias respiratorias · Chile",
    title: "Urgencias respiratorias en Chile",
    description: DESCRIPCION,
    images: [
      {
        url: `${SITIO}/og.png`,
        width: 1200,
        height: 630,
        alt: "Visualizador de urgencias respiratorias en Chile",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Urgencias respiratorias en Chile",
    description: DESCRIPCION,
    images: [`${SITIO}/og.png`],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Fija el tema antes del primer pintado para evitar parpadeo (FOUC).
const themeInit = `(function(){try{var t=localStorage.getItem("tema");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
