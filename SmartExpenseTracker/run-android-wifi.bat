@echo off
setlocal
cd /d "%~dp0"
title Smart Expense Tracker - Private Wi-Fi
where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found. Install a full JDK 17 or newer.
  pause
  exit /b 1
)
echo Opening the website for devices on your private Wi-Fi.
echo Use the phone link printed below. Keep this computer running.
echo.
java -Dfile.encoding=UTF-8 --add-modules jdk.httpserver ExpenseServer.java --lan --open
if errorlevel 1 pause
