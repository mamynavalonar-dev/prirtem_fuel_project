param(
    [switch]$NoBrowser,
    [switch]$WatchServer,
    [switch]$DevFrontend
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$NativeEnvPath = Join-Path $PSScriptRoot "server\.env.native"
$ServerDirectory = Join-Path $PSScriptRoot "server"
$ClientDirectory = Join-Path $PSScriptRoot "client"
$PidDirectory = Join-Path $PSScriptRoot "pids"

if (-not (Test-Path $NativeEnvPath)) {
    throw "Configuration native absente. Executez d'abord .\setup-native-windows.ps1"
}

$NodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
if (-not $NodeCommand) { throw "node.exe est introuvable. Installez Node.js 22 LTS." }

if (-not (Test-Path (Join-Path $ServerDirectory "node_modules")) -or
    -not (Test-Path (Join-Path $ClientDirectory "node_modules"))) {
    throw "Dependances absentes. Executez .\setup-native-windows.ps1"
}
if (-not $DevFrontend -and -not (Test-Path (Join-Path $ClientDirectory "dist\index.html"))) {
    throw "Frontend compile absent. Executez .\apply-performance-update.ps1"
}

function Assert-PortAvailable([int]$Port) {
    $Listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($Listener) {
        $Owner = ($Listener | Select-Object -First 1).OwningProcess
        throw "Le port $Port est deja utilise par le processus $Owner. Fermez-le puis relancez."
    }
}

function Wait-Http([string]$Url, [int]$TimeoutSeconds) {
    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline) {
        try {
            $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 400) { return $true }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    return $false
}

# Ne redemarre plus inutilement les deux processus. C'etait une cause directe
# du long delai lorsque start-native.ps1 etait relance sur une instance saine.
$ApiAlreadyReady = $false
$ClientAlreadyReady = $false
$ApiPortReady = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue
$ClientPortReady = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
if ($ApiPortReady -and $ClientPortReady) {
    $ApiAlreadyReady = Wait-Http "http://127.0.0.1:3001/api/health" 1
    $ClientAlreadyReady = Wait-Http "http://127.0.0.1:5173/login" 1
}
if ($ApiAlreadyReady -and $ClientAlreadyReady) {
    Write-Host "PRIRTEM est deja pret. Aucun redemarrage necessaire." -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process "http://localhost:5173/login" }
    exit 0
}

if (Test-Path (Join-Path $PSScriptRoot "stop-native.ps1")) {
    & (Join-Path $PSScriptRoot "stop-native.ps1") -Quiet
}

Assert-PortAvailable 3001
Assert-PortAvailable 5173
New-Item -ItemType Directory -Path $PidDirectory -Force | Out-Null

$env:PRIRTEM_ENV_FILE = $NativeEnvPath
$ServerArguments = if ($WatchServer) {
    @("--watch", "src/index.js")
} else {
    @("src/index.js")
}
$ServerProcess = Start-Process -FilePath $NodeCommand.Source `
    -ArgumentList $ServerArguments `
    -WorkingDirectory $ServerDirectory `
    -RedirectStandardOutput (Join-Path $PidDirectory "server-native.log") `
    -RedirectStandardError (Join-Path $PidDirectory "server-native-error.log") `
    -WindowStyle Hidden -PassThru

$ClientArguments = if ($DevFrontend) {
    @("node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort")
} else {
    @("node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "5173", "--strictPort")
}
$ClientProcess = Start-Process -FilePath $NodeCommand.Source `
    -ArgumentList $ClientArguments `
    -WorkingDirectory $ClientDirectory `
    -RedirectStandardOutput (Join-Path $PidDirectory "client-native.log") `
    -RedirectStandardError (Join-Path $PidDirectory "client-native-error.log") `
    -WindowStyle Hidden -PassThru
Remove-Item Env:PRIRTEM_ENV_FILE -ErrorAction SilentlyContinue

Set-Content -Path (Join-Path $PidDirectory "native-server.pid") -Value $ServerProcess.Id -Encoding ascii
Set-Content -Path (Join-Path $PidDirectory "native-client.pid") -Value $ClientProcess.Id -Encoding ascii

try {
    # Vite transforme /login une fois avant l'ouverture du navigateur. La page
    # visible apparait des que le frontend est pret, pendant que l'API termine.
    if (-not (Wait-Http "http://127.0.0.1:5173/login" 30)) {
        throw "Le frontend n'a pas demarre. Consultez pids\client-native-error.log"
    }
    if (-not $NoBrowser) {
        Start-Process "http://localhost:5173/login"
    }
    if (-not (Wait-Http "http://127.0.0.1:3001/api/health" 30)) {
        throw "L'API n'a pas demarre. Consultez pids\server-native-error.log"
    }
} catch {
    & (Join-Path $PSScriptRoot "stop-native.ps1") -Quiet
    throw
}

Write-Host "PRIRTEM est pret sans Docker." -ForegroundColor Green
Write-Host "API : http://127.0.0.1:3001"
Write-Host "Application : http://localhost:5173/login"
Write-Host "Arret : .\stop-native.ps1"
