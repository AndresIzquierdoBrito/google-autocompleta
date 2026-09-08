#!/bin/sh

set -eu

if command -v uv >/dev/null 2>&1 && uv --version >/dev/null 2>&1; then
  exec uv "$@"
fi

if command -v pyenv >/dev/null 2>&1; then
  for uv_version in $(pyenv whence uv 2>/dev/null || true); do
    uv_executable=$(PYENV_VERSION="$uv_version" pyenv which uv 2>/dev/null || true)
    if [ -n "$uv_executable" ] && [ -x "$uv_executable" ]; then
      exec "$uv_executable" "$@"
    fi
  done
fi

printf '%s\n' \
  "No se encontró una instalación ejecutable de uv." \
  "Instálala desde https://docs.astral.sh/uv/getting-started/installation/ y vuelve a intentarlo."
exit 127
