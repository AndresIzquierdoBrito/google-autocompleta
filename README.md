# Google Autocompleta

Juego independiente de búsquedas autocompletadas en español, construido con Expo/React Native Web y FastAPI.

> Google Autocompleta es un proyecto independiente y no está afiliado, patrocinado
> ni aprobado por Google LLC. Las respuestas son predicciones capturadas para el
> juego y no representan directamente las búsquedas más populares de Google.

Consulta la [guía para contribuir](CONTRIBUTING.md), la [política de seguridad](SECURITY.md)
y la [licencia MIT](LICENSE) para obtener más información sobre el proyecto.

## Requisitos

- Node.js 22 o posterior y pnpm 11.
- Python 3.12 y [uv](https://docs.astral.sh/uv/).

Los comandos locales detectan automáticamente `uv` aunque pyenv lo tenga instalado en una versión distinta de la activa.

## Desarrollo

```bash
make install
make seed
make api
```

En otra terminal:

```bash
make web
```

La web se abre en `http://localhost:8081` y la API en `http://localhost:8000`. Para abrir el cliente en un teléfono, ejecuta `pnpm --dir apps/client start` y escanea el QR con Expo Go. El cliente deduce la IP local del servidor de Expo; también puedes fijarla con `EXPO_PUBLIC_API_URL=http://TU-IP:8000`.

Para exportar la web manualmente, ejecuta `pnpm client:build` y sirve únicamente el
contenido de `apps/client/web-build`. Define `EXPO_PUBLIC_API_URL` solo cuando el
cliente y la API estén en orígenes distintos; con el despliegue recomendado de
Coolify, la API se sirve detrás del mismo origen y no hace falta configurarla.
`apps/client/dist` no es el directorio de publicación de este proyecto.

La exportación web usa `https://googleautocompleta.com/` como URL canónica para
SEO, compartir resultados, `robots.txt` y `sitemap.xml`. Si cambia el dominio de
producción, define `EXPO_PUBLIC_APP_URL` con una URL HTTPS absoluta antes de
ejecutar `pnpm client:build`.

## Despliegue en Coolify

El despliegue de producción usa `compose.yaml` desde la raíz del repositorio. El
servicio `web` sirve la exportación de Expo con Nginx y reenvía `/api` y `/health`
al servicio interno `api`. La base SQLite vive en el volumen Docker `api-data`,
por lo que no se pierde al recrear los contenedores.

En Coolify, selecciona el build pack Docker Compose, usa `compose.yaml`, configura
la rama de producción `main` y asigna el dominio generado únicamente al servicio
`web` (puerto interno 80). El servicio `api` no necesita un dominio público.
Configura el dominio apex `googleautocompleta.com` como principal y redirige
`www.googleautocompleta.com` al apex. Después del primer despliegue, verifica el
dominio en Google Search Console mediante DNS, envía
`https://googleautocompleta.com/sitemap.xml` y solicita la indexación de la
homepage desde URL Inspection.

## Estructura

- `apps/client`: aplicación Expo universal, persistencia local y contrato OpenAPI generado.
- `apps/api`: FastAPI, SQLAlchemy, Alembic y snapshots de contenido revisados.
- `.github/workflows/ci.yml`: lint, tipos, pruebas, migraciones, contrato y exportación web.

## Modos de juego

- **Diario:** un reto estable por fecha y un resultado por dispositivo. Los
  snapshots diarios se programan por adelantado y las fechas no disponibles se
  muestran explícitamente como no disponibles.
- **Histórico:** retos diarios ya publicados, con el progreso guardado localmente.
- **Aleatorio:** tres rondas con snapshots congelados, sin repetir tablero y categoría seleccionable.

## Calidad

```bash
make check
```

El catálogo v3 contiene 210 tableros inmutables: adaptaciones españolas
curadas, inspiradas en el formato de los juegos de autocompletado y revisadas
para ser familiares y aptas para todos los públicos. La partida nunca consulta
sugerencias en directo: cada resultado procede de un snapshot capturado y
congelado para el juego.
