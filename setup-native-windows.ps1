param(
    [int]$PostgresPort = 5432,
    [string]$PostgresUser = "postgres",
    [switch]$SkipNpmInstall
)

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
    throw "$ToolName.exe est introuvable. Installez PostgreSQL puis relancez ce script."
}

function Get-EnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path $Path)) { return $null }
    $Prefix = "$Name="
    $Line = Get-Content $Path | Where-Object { $_.StartsWith($Prefix) } | Select-Object -First 1
    if (-not $Line) { return $null }
    return $Line.Substring($Prefix.Length).Trim()
}

function New-RandomSecret {
    $Bytes = New-Object byte[] 48
    $Generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Generator.GetBytes($Bytes) } finally { $Generator.Dispose() }
    return [Convert]::ToBase64String($Bytes)
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

function Invoke-NativeCapture([scriptblock]$Command) {
    $PreviousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $Output = & $Command 2>&1
        return [PSCustomObject]@{ ExitCode = $LASTEXITCODE; Output = $Output }
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
}

$NodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
$NpmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $NodeCommand -or -not $NpmCommand) {
    throw "Node.js et npm sont requis. Installez Node.js 22 LTS puis relancez."
}

$Psql = Find-PostgresTool "psql"
$NativeEnvPath = Join-Path $PSScriptRoot "server\.env.native"

# Release ports 3001/5173/5432 while preserving every Docker volume. The old
# database remains available for migrate-docker-data-to-native.ps1.
if (Get-Command "docker.exe" -ErrorAction SilentlyContinue) {
    Write-Host "Arret des conteneurs PRIRTEM existants (donnees conservees)..." -ForegroundColor Yellow
    $DockerExitCode = Invoke-Native -Quiet { docker compose down }
    if ($DockerExitCode -ne 0) {
        Write-Warning "Docker n'a pas repondu, poursuite du reglage natif."
    }
}

$PostgresServices = Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "postgresql*" } |
    Sort-Object Name -Descending
$PostgresService = $PostgresServices | Select-Object -First 1
if ($PostgresService -and $PostgresService.Status -ne "Running") {
    try {
        Start-Service $PostgresService.Name
        $PostgresService.WaitForStatus("Running", [TimeSpan]::FromSeconds(20))
    } catch {
        throw "Le service PostgreSQL $($PostgresService.Name) ne demarre pas. Relancez PowerShell en administrateur."
    }
}

Write-Host "Configuration native PRIRTEM (sans Docker)" -ForegroundColor Cyan
Write-Host "PostgreSQL detecte : $Psql"
$SecurePassword = Read-Host "Mot de passe du compte PostgreSQL '$PostgresUser'" -AsSecureString
$PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
try {
    $PostgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer)
}

$env:PGPASSWORD = $PostgresPassword
try {
    $ConnectionCheck = Invoke-NativeCapture { & $Psql -h 127.0.0.1 -p $PostgresPort -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 -tAc "SELECT 1" }
    if ($ConnectionCheck.ExitCode -ne 0) {
        throw "Connexion PostgreSQL refusee. Verifiez le service, le port et le mot de passe. Detail : $($ConnectionCheck.Output)"
    }

    $ExistsResult = Invoke-NativeCapture { & $Psql -h 127.0.0.1 -p $PostgresPort -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_database WHERE datname='prirtem_fuel'" }
    if ($ExistsResult.ExitCode -ne 0) { throw "$($ExistsResult.Output)" }
    $DatabaseExists = (($ExistsResult.Output | Out-String).Trim() -eq "1")

    if (-not $DatabaseExists) {
        $CreateExitCode = Invoke-Native { & $Psql -h 127.0.0.1 -p $PostgresPort -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE prirtem_fuel" }
        if ($CreateExitCode -ne 0) { throw "Creation de la base prirtem_fuel impossible." }
    }

    $EncodedUser = [Uri]::EscapeDataString($PostgresUser)
    $EncodedPassword = [Uri]::EscapeDataString($PostgresPassword)
    $DatabaseUrl = "postgresql://${EncodedUser}:${EncodedPassword}@127.0.0.1:${PostgresPort}/prirtem_fuel"

    $JwtSecret = Get-EnvValue $NativeEnvPath "JWT_SECRET"
    if (-not $JwtSecret) { $JwtSecret = Get-EnvValue (Join-Path $PSScriptRoot ".env") "JWT_SECRET" }
    if (-not $JwtSecret -or $JwtSecret.Length -lt 32 -or $JwtSecret -like "GENERATE_*") {
        $JwtSecret = New-RandomSecret
    }

    $NativeEnvLines = @(
        "DATABASE_URL=$DatabaseUrl",
        "JWT_SECRET=$JwtSecret",
        "CLIENT_URL=http://localhost:5173",
        "APP_CLIENT_URL=http://localhost:5173",
        "NODE_ENV=development",
        "PORT=3001",
        "DB_SSL=false",
        "DB_POOL_MAX=20",
        "DB_IDLE_TIMEOUT_MS=30000",
        "DB_CONNECTION_TIMEOUT_MS=3000",
        "DB_STATEMENT_TIMEOUT_MS=30000"
    )
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($NativeEnvPath, $NativeEnvLines, $Utf8NoBom)

    if (-not $SkipNpmInstall) {
        Write-Host "Installation initiale des dependances backend..." -ForegroundColor Yellow
        $ServerInstallExitCode = Invoke-Native { & $NpmCommand.Source --prefix server ci }
        if ($ServerInstallExitCode -ne 0) { throw "npm ci a echoue dans server." }
        Write-Host "Installation initiale des dependances frontend..." -ForegroundColor Yellow
        $ClientInstallExitCode = Invoke-Native { & $NpmCommand.Source --prefix client ci }
        if ($ClientInstallExitCode -ne 0) { throw "npm ci a echoue dans client." }

        # Le travail couteux d'analyse/pre-bundling Vite est fait une seule
        # fois pendant l'installation, pas devant l'utilisateur au lancement.
        Write-Host "Preparation du cache frontend (une seule fois)..." -ForegroundColor Yellow
        $ViteCli = Join-Path $ClientDirectory "node_modules\vite\bin\vite.js"
        $OptimizeExitCode = Invoke-Native { & $NodeCommand.Source $ViteCli optimize $ClientDirectory --logLevel error }
        if ($OptimizeExitCode -ne 0) {
            Write-Warning "Le cache Vite sera cree automatiquement au premier lancement."
        }
    }

    Write-Host "Compilation du frontend rapide..." -ForegroundColor Yellow
    $ClientBuildExitCode = Invoke-Native { & $NpmCommand.Source --prefix client run build }
    if ($ClientBuildExitCode -ne 0) { throw "La compilation du frontend a echoue." }

    $env:DATABASE_URL = $DatabaseUrl
    $env:JWT_SECRET = $JwtSecret
    $env:NODE_ENV = "development"
    Write-Host "Application des migrations..." -ForegroundColor Yellow
    $MigrationExitCode = Invoke-Native { & $NpmCommand.Source --prefix server run db:migrate }
    if ($MigrationExitCode -ne 0) { throw "Les migrations ont echoue." }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
}

Write-Host "Configuration native terminee." -ForegroundColor Green
Write-Host "Pour conserver les donnees Docker : .\migrate-docker-data-to-native.ps1"
Write-Host "Puis demarrez : .\start-native.ps1"
