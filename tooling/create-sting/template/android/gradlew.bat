@echo off
setlocal
set VERSION=9.5.0
if "%GRADLE_USER_HOME%"=="" set GRADLE_USER_HOME=%USERPROFILE%\.gradle
set CACHE=%GRADLE_USER_HOME%\sting-wrapper\gradle-%VERSION%
if exist "%CACHE%\bin\gradle.bat" goto run
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $cache='%CACHE%'; $archive=$cache+'.zip'; New-Item -ItemType Directory -Force -Path (Split-Path $cache) | Out-Null; Invoke-WebRequest -UseBasicParsing 'https://services.gradle.org/distributions/gradle-%VERSION%-bin.zip' -OutFile $archive; $tmp=$cache+'.tmp'; Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue; Expand-Archive -Path $archive -DestinationPath $tmp -Force; Remove-Item -Recurse -Force $cache -ErrorAction SilentlyContinue; Move-Item ($tmp+'\gradle-%VERSION%') $cache; Remove-Item -Recurse -Force $tmp; Remove-Item -Force $archive"
if errorlevel 1 exit /b %errorlevel%
:run
call "%CACHE%\bin\gradle.bat" %*
