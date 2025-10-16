@echo off
title Auto Add FFmpeg to System PATH
echo ==========================================
echo     Auto Detecting and Adding FFmpeg
echo ==========================================
echo.

:: Require admin rights
>nul 2>&1 net session
if %errorlevel% neq 0 (
    echo [!] Please run this script as Administrator.
    pause
    exit /b
)

:: Search all drives for ffmpeg.exe (only in top 4 folder levels for speed)
echo Searching for ffmpeg.exe ... this may take a moment.
for %%D in (C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    for /f "delims=" %%F in ('dir /b /s /a-d "%%D:\ffmpeg.exe" 2^>nul') do (
        set "FOUND_PATH=%%~dpF"
        goto :found
    )
)

echo [ERROR] Could not find ffmpeg.exe on any drive.
echo Please extract FFmpeg manually (e.g. C:\ffmpeg\bin) and rerun this script.
pause
exit /b

:found
setlocal enabledelayedexpansion
echo.
echo [OK] Found FFmpeg at: !FOUND_PATH!
set "FFMPEG_BIN=!FOUND_PATH!"

:: Remove trailing backslash if any
if "!FFMPEG_BIN:~-1!"=="\" set "FFMPEG_BIN=!FFMPEG_BIN:~0,-1!"

:: Add to PATH
echo Adding "!FFMPEG_BIN!" to system PATH...
setx /M PATH "%PATH%;!FFMPEG_BIN!" >nul

echo.
echo ✅ Done! FFmpeg has been added to the system PATH.
echo You may need to restart Command Prompt or your PC for it to take effect.
echo Test by running: ffmpeg -version
pause
exit /b
