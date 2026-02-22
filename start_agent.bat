@echo off
color 0f
echo.
echo ======================================================
echo   RODANDO NAXIO AGENT - SERVIDOR HIBRIDO LOCAL
echo   (Python Automation Server)
echo ======================================================
echo.
echo   [Status] Iniciando servidor na porta 8080...
echo   [Status] Verificando backups locais...
echo.
cd server
python naxio_agent.py
pause
