@echo off
cd /d "%~dp0"
call mvnw.cmd -q -DskipTests package
if errorlevel 1 exit /b %errorlevel%
echo PocketSync - Spend smart. Stay in sync.
echo Open http://localhost:8080 in your browser.
java -jar target\pocketsync.jar
