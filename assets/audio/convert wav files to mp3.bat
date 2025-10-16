@echo off
title WAV to MP3 Converter
echo ============================================
echo   WAV to MP3 Batch Converter using FFmpeg
echo ============================================
echo.

REM Check if FFmpeg is installed
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo [ERROR] FFmpeg not found!
    echo Please install FFmpeg and make sure it's added to your PATH.
    pause
    exit /b
)

REM Loop through all .wav files in this folder
for %%A in ("*.wav") do (
    echo Converting: %%~nA.wav → %%~nA.mp3
    ffmpeg -hide_banner -loglevel error -i "%%A" -codec:a libmp3lame -qscale:a 2 "%%~nA.mp3"
)

echo.
echo All conversions complete!
pause
