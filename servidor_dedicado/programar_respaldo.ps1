# Programa el respaldo diario de la base de Sibarita en la PC SERVIDOR.
#
# Uso (PowerShell, idealmente "Ejecutar como administrador"):
#   .\programar_respaldo.ps1
#   .\programar_respaldo.ps1 -Hora 13:30 -CopiaExterna "D:\RespaldoSibarita"
#
# Que hace:
#   1. Copia backup-db.ps1 a la carpeta de respaldos (default C:\SibaritaRespaldos),
#      asi la tarea no depende de donde este esta carpeta del proyecto.
#   2. Revisa que exista pgpass.conf (la contrasena de Postgres para pg_dump).
#   3. Crea o reemplaza la tarea programada "Sibarita - Respaldo diario".
#   4. Corre un respaldo de prueba en el momento y muestra el resultado.
#
# Como administrador la tarea corre aunque nadie tenga la sesion iniciada.
# Sin administrador, solo corre mientras el usuario tenga la sesion abierta
# (si la PC estaba apagada a esa hora, corre apenas se pueda).
param(
    [string]$Hora         = "20:00",
    [string]$Carpeta      = "C:\SibaritaRespaldos",
    # Segunda copia fuera del disco principal (USB, otro disco, carpeta de
    # red, OneDrive). Vacio = sin copia externa.
    [string]$CopiaExterna = "",
    [string]$NombreTarea  = "Sibarita - Respaldo diario",
    [switch]$SinPrueba
)

$ErrorActionPreference = "Stop"

# 1. Script de respaldo: al lado de este archivo, o en ..\scripts del proyecto.
$origen = @(
    (Join-Path $PSScriptRoot "backup-db.ps1"),
    (Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\backup-db.ps1")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $origen) { throw "No se encontro backup-db.ps1 (ni al lado de este script ni en ..\scripts)" }

New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
$script = Join-Path $Carpeta "backup-db.ps1"
Copy-Item $origen $script -Force
Write-Host "Script de respaldo copiado a $script"

# 2. Contrasena para pg_dump. No se guarda en ningun script: va en el
#    pgpass.conf del usuario que corre la tarea.
$pgpass = Join-Path $env:APPDATA "postgresql\pgpass.conf"
if (-not (Test-Path $pgpass)) {
    Write-Warning @"
No existe $pgpass
Sin ese archivo el respaldo falla (pg_dump no sabe la contrasena). Crealo con UNA linea:
    localhost:5432:sibarita_db:postgres:<CONTRASENA-DE-POSTGRES>
(la misma contrasena que se eligio al instalar PostgreSQL en esta PC).
"@
}

# 3. Tarea programada.
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -BackupDir `"$(Join-Path $Carpeta 'backups')`" " +
    $(if ($CopiaExterna) { "-OffSiteDir `"$CopiaExterna`"" } else { "-SinCopiaExterna" })
$accion   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argumentos
$disparo  = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$usuario  = "$env:USERDOMAIN\$env:USERNAME"
# S4U: corre sin sesion iniciada y sin guardar la contrasena de Windows
# (necesita administrador para registrarse).
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType $(if ($esAdmin) { "S4U" } else { "Interactive" })

Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparo -Settings $ajustes `
    -Principal $principal -Force | Out-Null
Write-Host "Tarea '$NombreTarea' programada todos los dias a las $Hora" -ForegroundColor Green
if (-not $esAdmin) {
    Write-Warning "Sin administrador: la tarea solo corre con la sesion de $usuario iniciada. Para que corra siempre, volver a ejecutar este script como administrador."
}

# 4. Respaldo de prueba ahora mismo.
if (-not $SinPrueba) {
    Write-Host "Corriendo un respaldo de prueba..."
    Start-ScheduledTask -TaskName $NombreTarea
    $limite = (Get-Date).AddMinutes(3)
    do {
        Start-Sleep -Seconds 2
        $estado = (Get-ScheduledTask -TaskName $NombreTarea).State
    } while ($estado -eq "Running" -and (Get-Date) -lt $limite)

    $log = Join-Path $Carpeta "backups\backup-log.txt"
    $ultima = if (Test-Path $log) { Get-Content $log -Tail 1 } else { "(sin log)" }
    if ($ultima -like "*OK -*") {
        Write-Host "Respaldo de prueba OK: $ultima" -ForegroundColor Green
    } else {
        Write-Warning "El respaldo de prueba no salio bien: $ultima"
    }
}
