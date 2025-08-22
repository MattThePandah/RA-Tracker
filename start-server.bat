@echo off
echo Starting PSFest local server with IGDB proxy...
echo.
echo Open your browser to: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

REM Try Node.js proxy server first (recommended for IGDB support)
node proxy-server.js 2>nul
if %errorlevel% neq 0 (
    echo Node.js proxy server failed, trying fallback servers...
    echo NOTE: IGDB cover art will not work without Node.js proxy
    echo.
    
    REM Try Python 3 as fallback
    python -m http.server 8000 2>nul
    if %errorlevel% neq 0 (
        REM Try Python 2 if Python 3 fails
        python -m SimpleHTTPServer 8000 2>nul
        if %errorlevel% neq 0 (
            REM Try Node.js simple server if Python fails
            npx http-server -p 8000 2>nul
            if %errorlevel% neq 0 (
                echo ERROR: No suitable server found!
                echo.
                echo Please install one of:
                echo - Node.js ^(recommended for IGDB support^)
                echo - Python ^(python -m http.server^)
                echo.
                pause
            )
        )
    )
)