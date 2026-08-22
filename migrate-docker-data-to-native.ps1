$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Find-PostgresTool([string]$ToolName) {
    $Command = Get-Command "$ToolName.exe" -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }

    $PostgresRoot = "C:\Program Files\PostgreSQL"
    if (Test-Path $PostgresRoot) {
        $Candidates = Get-ChildItem $PostgresRoot -Directory |
            Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending |
            ForEach-Object { Join-Path $_.FullName "bin\$ToolName.exe" } |
            Where-Object { Test-Path $_ }
        if ($Candidates) { return $Candidates[0] }
    }
    throw "$ToolName.exe est introuvable."
}

function Get-EnvValue([string]$Path, [string]$Name) {
    $Prefix = "$Name="
    $Line = Get-Content $Path | Where-Object { $_.StartsWith($Prefix) } | Select-Object -First 1
    if (-not $Line) { throw "$Name est absent de $Path" }
    return $Line.Substring($Prefix.Length).Trim()
}

function Invoke-Native([scriptblock]$Command, [switch]$Quiet) {
    $PreviousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($Quiet) {
            & $Command 2>$null | Out-Null
        } else {
            & $Command 2>&1 | Out-Host
        }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
}

$NativeEnvPath = Join-Path $PSScriptRoot "server\.env.native"
if (-not (Test-Path $NativeEnvPath)) {
    throw "Executez d'abord .\setup-native-windows.ps1"
}
if (-not (Get-Command "docker.exe" -ErrorAction SilentlyContinue)) {
    throw "Docker est requis une derniere fois uniquement pour extraire les donnees existantes."
}

$DatabaseUrl = Get-EnvValue $NativeEnvPath "DATABASE_URL"
$DatabaseUri = [Uri]$DatabaseUrl
$UserInfoSeparator = $DatabaseUri.UserInfo.IndexOf(':')
if ($UserInfoSeparator -lt 1) { throw "DATABASE_URL native invalide." }
$NativeUser = [Uri]::UnescapeDataString($DatabaseUri.UserInfo.Substring(0, $UserInfoSeparator))
$NativePassword = [Uri]::UnescapeDataString($DatabaseUri.UserInfo.Substring($UserInfoSeparator + 1))
$NativeHost = $DatabaseUri.Host
$NativePort = if ($DatabaseUri.Port -gt 0) { $DatabaseUri.Port } else { 5432 }
$NativeDatabase = $DatabaseUri.AbsolutePath.TrimStart('/')
if ($NativeDatabase -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    throw "Nom de base native invalide dans server\.env.native."
}

$Psql = Find-PostgresTool "psql"
$PgDump = Find-PostgresTool "pg_dump"
$PgRestore = Find-PostgresTool "pg_restore"
$DropDb = Find-PostgresTool "dropdb"
$CreateDb = Find-PostgresTool "createdb"

Write-Host "Migration unique Docker -> PostgreSQL Windows" -ForegroundColor Cyan
Write-Host "La base Windows '$NativeDatabase' sera sauvegardee puis remplacee par la base Docker."
Write-Host "Le volume Docker original ne sera pas supprime."
$Confirmation = Read-Host "Tapez exactement MIGRER pour continuer"
if ($Confirmation -cne "MIGRER") {
    Write-Host "Migration annulee. Aucune donnee n'a ete modifiee."
    exit 0
}

$BackupDirectory = Join-Path $PSScriptRoot "backups"
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$DockerDump = Join-Path $BackupDirectory "docker-source-$Timestamp.dump"
$NativeBackup = Join-Path $BackupDirectory "native-before-import-$Timestamp.dump"
$ExportContainer = "prirtem-db-export-$PID"
$ExportContainerStarted = $false

try {
    Write-Host "Arret des anciens conteneurs PRIRTEM (volumes conserves)..." -ForegroundColor Yellow
    $DockerDownExitCode = Invoke-Native -Quiet { docker compose down }
    if ($DockerDownExitCode -ne 0) { throw "docker compose down a echoue." }

    Write-Host "Demarrage temporaire de la base Docker sans publier le port 5432..." -ForegroundColor Yellow
    $DockerRunExitCode = Invoke-Native -Quiet { docker compose run -d --no-deps --name $ExportContainer db }
    if ($DockerRunExitCode -ne 0) { throw "Impossible de demarrer la base Docker temporaire." }
    $ExportContainerStarted = $true

    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
        $ReadyExitCode = Invoke-Native -Quiet { docker exec $ExportContainer pg_isready -U postgres -d prirtem_fuel }
        if ($ReadyExitCode -eq 0) { $Ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $Ready) { throw "La base Docker temporaire n'est pas devenue disponible." }

    $DockerDumpExitCode = Invoke-Native { docker exec $ExportContainer pg_dump -U postgres -d prirtem_fuel --format=custom --no-owner --no-privileges --file=/tmp/prirtem-native.dump }
    if ($DockerDumpExitCode -ne 0) { throw "La sauvegarde de la base Docker a echoue." }
    $DockerCopyExitCode = Invoke-Native -Quiet { docker cp "${ExportContainer}:/tmp/prirtem-native.dump" $DockerDump }
    if ($DockerCopyExitCode -ne 0 -or -not (Test-Path $DockerDump)) { throw "La copie de la sauvegarde Docker a echoue." }
} finally {
    if ($ExportContainerStarted) {
        [void](Invoke-Native -Quiet { docker rm -f $ExportContainer })
    }
}

$env:PGPASSWORD = $NativePassword
try {
    Write-Host "Sauvegarde de securite de la base PostgreSQL Windows..." -ForegroundColor Yellow
    $NativeDumpExitCode = Invoke-Native { & $PgDump -h $NativeHost -p $NativePort -U $NativeUser -d $NativeDatabase --format=custom --no-owner --no-privileges --file=$NativeBackup }
    if ($NativeDumpExitCode -ne 0) { throw "La sauvegarde de securite Windows a echoue. La base n'a pas ete remplacee." }

    $TerminateExitCode = Invoke-Native { & $Psql -h $NativeHost -p $NativePort -U $NativeUser -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$NativeDatabase' AND pid <> pg_backend_pid();" }
    if ($TerminateExitCode -ne 0) { throw "Impossible de fermer les connexions a la base native." }

    $DropExitCode = Invoke-Native { & $DropDb -h $NativeHost -p $NativePort -U $NativeUser --if-exists $NativeDatabase }
    if ($DropExitCode -ne 0) { throw "Suppression preparatoire de la base native impossible. Sauvegarde : $NativeBackup" }
    $CreateExitCode = Invoke-Native { & $CreateDb -h $NativeHost -p $NativePort -U $NativeUser $NativeDatabase }
    if ($CreateExitCode -ne 0) { throw "Recreation de la base native impossible. Sauvegarde : $NativeBackup" }

    Write-Host "Restauration des donnees Docker dans PostgreSQL Windows..." -ForegroundColor Yellow
    $RestoreExitCode = Invoke-Native { & $PgRestore -h $NativeHost -p $NativePort -U $NativeUser -d $NativeDatabase --no-owner --no-privileges --exit-on-error $DockerDump }
    if ($RestoreExitCode -ne 0) {
        throw "Restauration echouee. Les sauvegardes sont conservees dans $BackupDirectory"
    }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "Migration terminee. Docker n'est plus necessaire pour lancer PRIRTEM." -ForegroundColor Green
Write-Host "Sauvegarde Docker : $DockerDump"
Write-Host "Sauvegarde native precedente : $NativeBackup"
Write-Host "Demarrage : .\start-native.ps1"
