@echo off
cd /d "%~dp0"
node server.mjs --lan
if errorlevel 1 pause
