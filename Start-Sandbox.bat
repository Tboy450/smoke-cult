@echo off
rem Double-click to play the drift sandbox. Keep this window open while playing; close it to stop.
cd /d "%~dp0"
node server.mjs
if errorlevel 1 pause
