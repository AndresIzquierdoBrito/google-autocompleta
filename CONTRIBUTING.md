# Contribuir

Gracias por tu interés en Google Autocompleta. El proyecto es independiente y
no está afiliado, patrocinado ni aprobado por Google LLC.

## Preparar el entorno

Necesitas Node.js 22 o posterior, pnpm 11, Python 3.12 y [uv](https://docs.astral.sh/uv/).

```bash
make install
make seed
make api
```

En otra terminal, ejecuta `make web`. Para comprobar todos los cambios antes de
abrir un pull request, ejecuta `make check`.

## Pull requests

- Explica qué cambia y por qué; mantén cada pull request centrado en un objetivo.
- Añade o actualiza pruebas cuando cambie el comportamiento.
- Si cambia el contrato de la API, regenera `apps/client/src/api/schema.d.ts`.
- No incluyas credenciales, bases de datos locales, builds, caches ni material
  editorial privado de `.agents/`.
- Comprueba que CI y `make check` pasan antes de solicitar revisión.

Para cambios grandes de producto, abre primero un issue describiendo la propuesta.
