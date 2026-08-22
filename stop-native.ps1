param(
    [switch]$Quiet
)

$ErrorActionPreference = "SilentlyContinue"
Set-Location $PSScriptRoot
$PidDirectory = Join-Path $PSScriptRoot "pids"
$Stopped = 0

foreach ($PidFileName in @("native-server.pid", "native-client.pid")) {
    $PidFile = Join-Path $PidDirectory $PidFileName
    if (-not (Test-Path $PidFile)) { continue }

    $NativeProcessId = [int](Get-Content $PidFile | Select-Object -First 1)
    if (Get-Process -Id $NativeProcessId -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $NativeProcessId /T /F | Out-Null
        $Stopped++
    }
    Remove-Item $PidFile -Force
}

if (-not $Quiet) {
    if ($Stopped -gt 0) {
        Write-Host "PRIRTEM natif arrete." -ForegroundColor Green
    } else {
        Write-Host "Aucun processus PRIRTEM natif en cours."
    }
}
