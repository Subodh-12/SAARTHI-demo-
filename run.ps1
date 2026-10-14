# Thin wrapper around scripts/dev.py
# Usage from PowerShell:
#   .\run.ps1 setup
#   .\run.ps1 start
#   .\run.ps1 test
#   .\run.ps1 doctor
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$py = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }
& $py scripts\dev.py @args
