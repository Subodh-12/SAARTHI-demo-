#!/usr/bin/env bash
# Thin wrapper around scripts/dev.py
cd "$(dirname "$0")" || exit 1
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
exec "$PY" scripts/dev.py "$@"
