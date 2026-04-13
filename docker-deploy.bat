@echo off
REM ─────────────────────────────────────────────────────────────────
REM  ElinosaAI — Docker build + push script (Windows)
REM  Usage: docker-deploy.bat YOUR_DOCKERHUB_USERNAME
REM  Example: docker-deploy.bat nosana123
REM ─────────────────────────────────────────────────────────────────

SET USERNAME=%1
IF "%USERNAME%"=="" (
  echo ERROR: Pass your Docker Hub username as argument
  echo Usage: docker-deploy.bat YOUR_USERNAME
  exit /b 1
)

SET IMAGE=%USERNAME%/elinosaai-agent
SET TAG=latest

echo.
echo ===================================================
echo  Building: %IMAGE%:%TAG%
echo ===================================================
echo.

docker build -t %IMAGE%:%TAG% .
IF %ERRORLEVEL% NEQ 0 (
  echo.
  echo ERROR: Docker build failed. Fix errors above then retry.
  exit /b 1
)

echo.
echo ===================================================
echo  Pushing: %IMAGE%:%TAG%
echo ===================================================
echo.

docker push %IMAGE%:%TAG%
IF %ERRORLEVEL% NEQ 0 (
  echo.
  echo ERROR: Push failed. Make sure you ran: docker login
  exit /b 1
)

echo.
echo ===================================================
echo  SUCCESS! Image pushed to Docker Hub.
echo.
echo  To run locally with your secrets:
echo    docker run --env-file .env -p 3000:3000 %IMAGE%:%TAG%
echo.
echo  Your image URL (for Nosana):
echo    docker.io/%IMAGE%:%TAG%
echo ===================================================
