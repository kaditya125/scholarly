@echo off
REM Quick start script for Podcast Video Generation PoC
REM Windows batch file

echo ======================================================================
echo   PODCAST VIDEO GENERATION - PHASE 3 POC
echo   Quick Start Script
echo ======================================================================
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found
    echo Please copy .env.example to .env and configure it
    pause
    exit /b 1
)

REM Check if GOOGLE_APPLICATION_CREDENTIALS is set
if "%GOOGLE_APPLICATION_CREDENTIALS%"=="" (
    echo WARNING: GOOGLE_APPLICATION_CREDENTIALS not set in environment
    echo Make sure FIREBASE_PROJECT_ID is set in .env file
    echo.
)

echo Starting PoC test run...
echo This will cost approximately $2-3
echo.
pause

echo.
echo Running video generation...
echo.

npx tsx poc_video_generation.ts --transcript ./test_transcript_solar_system.json --output ./poc_output

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo   POC COMPLETED SUCCESSFULLY!
    echo ======================================================================
    echo.
    echo Output video: poc_output\final_documentary.mp4
    echo Results: poc_output\poc_results.json
    echo.
    echo Next steps:
    echo 1. Watch the generated video
    echo 2. Review poc_results.json
    echo 3. Check console output for costs
    echo.
) else (
    echo.
    echo ======================================================================
    echo   POC FAILED
    echo ======================================================================
    echo.
    echo Check the error messages above
    echo Review POC_VIDEO_GENERATION_README.md for troubleshooting
    echo.
)

pause
