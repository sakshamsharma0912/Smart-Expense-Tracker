#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
chmod +x ./mvnw
./mvnw -q -DskipTests package
echo "PocketSync - Spend smart. Stay in sync."
echo "Open http://localhost:8080 in your browser."
exec java -jar target/pocketsync.jar
