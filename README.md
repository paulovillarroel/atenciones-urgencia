# Urgencias respiratorias en Chile

Visualizador web de las **atenciones y hospitalizaciones de urgencia por causas respiratorias** en Chile,
por semana epidemiológica. Permite **comparar por cualquier dimensión** —años, causas
(CIE-10), grupos etarios, regiones o servicios de salud— con las demás como filtro de
contexto, ver **tasas por 100.000 habitantes** (al comparar años, regiones o
servicios de salud, ajustadas por grupo etario y área), y **exportar el gráfico como
imagen (PNG)** con etiquetas directas. Sitio
estático que se **actualiza a diario** desde los datos abiertos del DEIS (Ministerio
de Salud).

**[▶ Ver el visor en vivo](https://paulovillarroel.github.io/atenciones-urgencia/)**

![Visor de atenciones de urgencia respiratorias en Chile — comparación por años](docs/captura.png)

- **Fuente:** [Atenciones de urgencia – causas respiratorias](https://datos.gob.cl/dataset/atenciones-de-urgencia-causas-respiratorias) (datos.gob.cl / DEIS).
- **Gráfico:** eje X = semana epidemiológica, eje Y = volumen de atenciones; una línea por cada valor de la dimensión que elijas comparar.
- **Stack:** Next.js 16 (export estático) · React 19 · Tailwind v4 · Observable Plot · DuckDB (pipeline).

## Cómo funciona

1. Un script (`scripts/build-data.mjs`) descarga el parquet del DEIS (~67 MB) y con
   **DuckDB** lo limpia y lo **pre-agrega** a un archivo compacto (~1 MB) que se
   guarda en `public/data/`.
2. La app estática (Next.js `output: "export"`) carga ese archivo en el navegador y
   **filtra y grafica del lado del cliente** (sin servidor, sin descargar los 67 MB).
3. Una **GitHub Action** repite los pasos 1 y 2 **cada día** y publica en GitHub Pages.

## Desarrollo local

Requiere Node 20+ (probado en Node 24).

```bash
npm install
npm run data     # descarga y pre-agrega los datos -> public/data/ (necesario la 1a vez)
npm run dev      # http://localhost:3000
```

Otros comandos:

```bash
npm run build    # export estático a ./out
npm run lint
```

> `public/data/` está en `.gitignore`: los datos se regeneran con `npm run data` y en
> cada despliegue. Si abres la app sin haberlos generado, verás un aviso pidiéndote
> correr `npm run data`.

## Desplegar en GitHub Pages

1. Sube el repositorio a GitHub (rama `main`).
2. En **Settings → Pages**, en *Build and deployment → Source*, elige **GitHub Actions**.
3. Listo. El workflow `.github/workflows/deploy.yml` construye y publica en cada push,
   a diario (cron 11:00 UTC) y de forma manual (*Actions → Run workflow*).

El workflow calcula solo el *base path*: en una **página de proyecto** el sitio queda
en `https://<usuario>.github.io/<repo>/`; en una página de usuario
(`<usuario>.github.io`) queda en la raíz.

## Decisiones sobre los datos

- **Semana incompleta.** Se descarta la última semana epidemiológica del año en curso
  por estar incompleta. En el año en curso la semana 53 es la *primera* (arrastre de
  inicio de enero), así que "última" es la de mayor número del bloque contiguo 1..N,
  no la 53. La regla es dinámica (no hay años fijados en el código).
- **Sin doble conteo.** `OrdenCausa = 3` (*Total sistema respiratorio, J00-J98*) ya es la
  suma de sus subcausas (4–9); el COVID-19 (10/11) se contabiliza aparte. El gráfico
  nunca suma sobre todas las causas.
- **Glosas normalizadas por código.** El origen trae typos de glosa (Región 14
  "Los/los Ríos", Servicio 25 "Aysén/Aisén", etc.). Se normaliza por código: **16
  regiones y 29 servicios de salud**. Las ~0,7 % de filas con código nulo se conservan
  solo en el total nacional ("Todas"), no como opción filtrable.
- **Grupos etarios.** El dato trae los conteos por edad en columnas anchas
  (`<1`, `1–4`, `5–14`, `15–64`, `≥65`); el filtro de grupo etario selecciona la columna.
- **Tasas por 100.000 hab.** Al comparar **años, regiones o servicios de salud** se
  puede cambiar de valor absoluto a tasa. El denominador se **ajusta al contexto**:
  al grupo etario elegido (población por banda de edad) y al área geográfica (región
  o servicio seleccionado, o total país al comparar años). Población **territorial
  (residente) del INE** (Estimaciones y Proyecciones 2002–2035, base Censo 2017),
  **por año** y por banda etaria (las del DEIS: `<1`, `1–4`, `5–14`, `15–64`, `≥65`).
  Región y país se agregan directo del cuadro comunal INE; el total por servicio (que
  no tiene serie etaria oficial) se distribuye por la estructura etaria de su región.
  No usa población beneficiaria FONASA. La tabla vive en `scripts/poblacion.mjs`.

## Hospitalizaciones (pendiente para v2)

Este mismo dataset trae, además de las atenciones, una serie de **hospitalizaciones**
como filas con `OrdenCausa` 33, 34 y 35 (las que empiezan con `- `: sistema
respiratorio y COVID). En v1 se omiten. Para incorporarlas:

1. En `scripts/build-data.mjs`, incluir esos órdenes (hoy el filtro es
   `ATENCION_ORDENES = [3..11]`) marcándolos como una sección aparte.
2. Agregar en la interfaz un selector *atenciones ↔ hospitalizaciones* que cambie el
   conjunto de causas y la etiqueta del eje Y.

## Estructura

```
scripts/build-data.mjs   Pipeline de datos (DuckDB): descarga, limpia y pre-agrega
public/data/             Datos generados (JSON columnar + lookups + meta) — gitignored
lib/                     Tipos, carga/agregación, colores (paleta), formato
components/              Dashboard, filtros, gráfico (Observable Plot), tema
app/                     Next.js App Router (layout, página, estilos)
.github/workflows/       GitHub Action (refresco diario + deploy a Pages)
```

## Créditos

- **Datos de atenciones:** DEIS – Ministerio de Salud de Chile, publicados en datos.gob.cl.
- **Población (para tasas):** INE – Estimaciones y Proyecciones de Población de Chile 2002–2035, base Censo 2017.
- **Visualización y desarrollo:** [Paulo Villarroel Tapia](https://www.linkedin.com/in/paulovillarroel/).
- **Inspiración metodológica:** taller de datos abiertos en R, [paulovillarroel/api-datos-gob](https://github.com/paulovillarroel/api-datos-gob).
