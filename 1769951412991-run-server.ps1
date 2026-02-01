#!/usr/bin/env pwsh
# run-server.ps1
# Helper to install dependencies and start the server for the PGDCA notes project.
# Run with: PowerShell (Admin) or use execution bypass: `powershell -ExecutionPolicy Bypass -File run-server.ps1`

$proj = "c:\Users\suraj  soni\Downloads\pgdca-notes"
Write-Host "Project folder: $proj" -ForegroundColor Cyan
if (-not (Test-Path $proj)){
  Write-Error "Project folder not found: $proj"
  exit 1
}

Set-Location $proj

if (-not (Test-Path package.json)){
  Write-Error "package.json not found in $proj. Make sure you are using the correct folder."
  exit 1
}

Write-Host "Node version:" -NoNewline; node -v
Write-Host "npm version:" -NoNewline; npm -v

Write-Host "Cleaning npm cache..." -ForegroundColor Yellow
& npm cache clean --force

Write-Host "Removing any existing node_modules and package-lock.json (if present)..." -ForegroundColor Yellow
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force .\package-lock.json -ErrorAction SilentlyContinue

Write-Host "Running npm install (verbose). This may take a few minutes..." -ForegroundColor Green
& npm install --verbose
if ($LASTEXITCODE -ne 0){
  Write-Error "npm install failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "npm install completed successfully." -ForegroundColor Green

Write-Host "Starting the server (Ctrl+C to stop)." -ForegroundColor Cyan
& npm start
