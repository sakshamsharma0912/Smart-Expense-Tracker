#!/usr/bin/env sh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v java >/dev/null 2>&1; then
  echo 'Java was not found. Install a full JDK 17 or newer, then run this file again.' >&2
  exit 1
fi
exec java -Dfile.encoding=UTF-8 --add-modules jdk.httpserver ExpenseServer.java --open "$@"
