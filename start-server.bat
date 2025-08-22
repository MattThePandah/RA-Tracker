@echo off
echo Starting IGDB Proxy Server...
cd /d "%~dp0"
if exist "server\.env" (
    echo Found server environment file
) else (
    echo WARNING: server\.env not found - create it with your Twitch API credentials
)
node server/index.js
pause