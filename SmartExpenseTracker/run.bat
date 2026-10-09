@echo off
setlocal
cd /d "%~dp0"
title Smart Expense Tracker - Java Web App
where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found. Install JDK 17 or newer, then run this file again.
  pause
  exit /b 1
)
java -Dfile.encoding=UTF-8 --add-modules jdk.httpserver ExpenseServer.java --open
if errorlevel 1 (
  echo.
  echo The app could not start. Check the message above. A full JDK 17 or newer is required.
  pause
)
