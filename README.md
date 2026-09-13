# Google Autocompleta

Juego independiente de búsquedas autocompletadas en español, construido con Expo/React Native Web y FastAPI.

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

Para publicar la web, ejecuta `pnpm client:build` y sirve únicamente el contenido
de `apps/client/web-build`. Define `EXPO_PUBLIC_API_URL` con la URL pública de la
API y `EXPO_PUBLIC_APP_URL` con la URL pública del juego antes de compilar;
`apps/client/dist` no es el directorio de publicación de este proyecto.

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

Google Autocompleta es un juego independiente y no está afiliado, patrocinado ni aprobado por Google LLC. Las respuestas son predicciones capturadas para el juego; no representan directamente las búsquedas más populares de Google.
