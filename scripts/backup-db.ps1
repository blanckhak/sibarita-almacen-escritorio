# Respaldo de la base sibarita_db con pg_dump.
#
# Sin parametros hace lo mismo que siempre en la PC de desarrollo: guarda en
# <carpeta del proyecto>\backups y copia a OneDrive\SibaritaBackups.
# En la PC servidor lo programa servidor_dedicado\programar_respaldo.ps1,
# pasandole su propia carpeta de respaldos.
#
# La contrasena de Postgres NO va en este script: pg_dump la toma de
# %APPDATA%\postgresql\pgpass.conf del usuario que lo corre (o de la variable
# PGPASSWORD). -w hace que falle al toque si no la encuentra, en vez de
# quedarse esperando que alguien la escriba (en una tarea programada nadie la
# escribe y el respaldo nunca terminaria).
param(
    [string]$BackupDir  = (Join-Path (Split-Path $PSScriptRoot -Parent) "backups"),
    # Copia fuera de la PC. Vacio = sin copia externa.
    [string]$OffSiteDir = $(if ($env:OneDrive) { Join-Path $env:OneDrive "SibaritaBackups" } else { "" }),
    [int]$ConservarLocal   = 30,
    [int]$ConservarExterno = 90,
    # Sin copia externa aunque haya OneDrive (lo usa programar_respaldo.ps1:
    # pasar -OffSiteDir "" por linea de comandos no es confiable).
    [switch]$SinCopiaExterna
)

$ErrorActionPreference = "Stop"
if ($SinCopiaExterna) { $OffSiteDir = "" }

$dbName      = "sibarita_db"
$dbUser      = "postgres"
$dbHost      = "localhost"
$dbPort      = "5432"

# pg_dump de la version de PostgreSQL mas nueva instalada (antes estaba fijo
# en la 16; la PC servidor puede tener otra).
$pgDump = Get-ChildItem (Join-Path $env:ProgramFiles "PostgreSQL") -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Name -replace '\D', '') } -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1

$logFile = Join-Path $BackupDir "backup-log.txt"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
if ($OffSiteDir) { New-Item -ItemType Directory -Force -Path $OffSiteDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName  = "sibarita_db_$timestamp.sql"
$fullPath  = Join-Path $BackupDir $fileName

function Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content -Path $logFile
}

function Limpiar-Antiguos($carpeta, $conservar) {
    $viejos = Get-ChildItem -Path $carpeta -Filter "sibarita_db_*.sql" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $conservar
    foreach ($v in $viejos) { $v.Delete() }
}

try {
    if (-not $pgDump) {
        throw "No se encontro pg_dump.exe en $env:ProgramFiles\PostgreSQL\<version>\bin"
    }

    & $pgDump -w -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -f $fullPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump termino con codigo de salida $LASTEXITCODE (revisar pgpass.conf si es un problema de contrasena)"
    }

    if ($OffSiteDir) {
        Copy-Item -Path $fullPath -Destination $OffSiteDir -Force
        Log "OK - $fileName (copiado tambien a $OffSiteDir)"
        Limpiar-Antiguos $OffSiteDir $ConservarExterno
    } else {
        Log "OK - $fileName (sin copia externa)"
    }

    Limpiar-Antiguos $BackupDir $ConservarLocal
}
catch {
    Log "ERROR - $($_.Exception.Message)"
    throw
}
