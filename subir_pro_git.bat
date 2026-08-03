@echo off
echo Iniciando Deploy para GitHub...
git init
git remote add origin https://github.com/PazChurchParaipaba/projetoentrega
git checkout -b main
git add .
git commit -m "Update: Naxio Restaurantes UI e Reforma Tributaria 2026"
echo Empurrando para o GitHub (main)...
git push -u origin main
echo Finalizado!
pause
