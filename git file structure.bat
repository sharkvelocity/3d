@echo off
echo Restructuring folders for Phasma-Phoney 3D...

REM === Create directory structure ===
mkdir assets\models\environments
mkdir assets\models\ghosts
mkdir assets\models\items
mkdir assets\audio
mkdir scripts\core
mkdir scripts\ghost
mkdir scripts\ui

REM === Move model files ===
git mv Abandoned_House.glb assets\models\environments\
git mv ghost1.glb assets\models\ghosts\
git mv ghost2.glb assets\models\ghosts\
git mv ghost3.glb assets\models\ghosts\
git mv ThermoMeter.fbx assets\models\items\
git mv SpiritBox.fbx assets\models\items\
git mv EMF.fbx assets\models\items\
git mv videoCamera.fbx assets\models\items\
git mv flashlight.fbx assets\models\items\
git mv notebook_open.fbx assets\models\items\
git mv music_box.fbx assets\models\items\
git mv tarot_card_flipped.fbx assets\models\items\

REM === Move audio files ===
for %%f in (*.mp3) do git mv "%%f" assets\audio\

REM Optional: merge contents of audio\ if it exists
if exist audio (
    move audio\* assets\audio\
    rmdir /s /q audio
)

REM === Move JS files ===
git mv main.js scripts\core\
git mv ghost.js scripts\ghost\
git mv ghostAI.js scripts\ghost\
git mv ghost_logic.js scripts\ghost\
git mv ui.js scripts\ui\
git mv hud.js scripts\ui\
if exist sound.js git mv sound.js scripts\audio\

REM === Cleanup README placeholder ===
if exist README del README

REM === Create new README.md ===
echo # Phasma‑Phoney 3D > README.md
echo. >> README.md
echo Work in progress. >> README.md

REM === Stage all changes ===
git add .

REM === Commit the restructuring ===
git commit -m "Restructure project into organized folders: assets, scripts, models, audio"

echo Done. Push with: git push origin main
pause
