#!/bin/sh
# Keystar container entrypoint: `web` (default), `worker`, `migrate` or `demo-seed`.
set -e

case "$1" in
  web)
    node dist/migrate.mjs
    exec node server.js
    ;;
  worker)
    export KEYSTAR_ROLE=worker
    exec node dist/worker.mjs
    ;;
  migrate)
    exec node dist/migrate.mjs
    ;;
  demo-seed)
    shift
    exec node dist/demo-seed.mjs "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
