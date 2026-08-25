$ErrorActionPreference = "Stop"

$pgDump      = Join-Path $env:ProgramFiles "PostgreSQL\16\bin\pg_dump.exe"
$dbName      = "sibarita_db"
$dbUser      = "postgres"
$dbHost      = "localhost"
$dbPort      = "5432"

$backupDir   = "C:\Users\DRGATO\Documents\sibarita escritorio\backups"
$offSiteDir  = "C:\Users\DRGATO\OneDrive\SibaritaBackups"
$logFile     = Join-Path $backupDir "backup-log.txt"

New-Item -ItemType Directory -Force -Path $backupDir  | Out-Null
New-Item -ItemType Directory -Force -Path $offSiteDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName  = "sibarita_db_$timestamp.sql"
$fullPath  = Join-Path $backupDir $fileName

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
    & $pgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F p -f $fullPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump termino con codigo de salida $LASTEXITCODE"
    }

    Copy-Item -Path $fullPath -Destination $offSiteDir -Force

    Log "OK - $fileName (copiado tambien a OneDrive)"

    Limpiar-Antiguos $backupDir 30
    Limpiar-Antiguos $offSiteDir 90
}
catch {
    Log "ERROR - $($_.Exception.Message)"
    throw
}
