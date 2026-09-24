# Deja el backend de Sibarita corriendo SOLO en la PC SERVIDOR: arranca con
# Windows, sin que nadie inicie sesion ni abra la app, y se relanza si se cae.
#
# Uso (PowerShell COMO ADMINISTRADOR, en esta carpeta):
#   .\instalar_servicio.ps1               instala / reinstala y lo arranca
#   .\instalar_servicio.ps1 -Detener      lo detiene (ANTES de instalar una version nueva de Sibarita)
#   .\instalar_servicio.ps1 -Iniciar      lo vuelve a arrancar (despues de actualizar)
#   .\instalar_servicio.ps1 -Quitar       lo detiene y borra la tarea
#   opcional: -RutaSibarita "D:\Sibarita\Sibarita.exe"   -Puerto 3000
#
# Que hace:
#   1. Busca Sibarita.exe instalado (o usa -RutaSibarita).
#   2. Escribe C:\SibaritaServidor\iniciar_backend.cmd: corre el backend que
#      viene dentro del instalador (el mismo que levanta la app) y, si termina
#      por cualquier motivo (Postgres todavia no arranco, un error), espera
#      10 segundos y lo vuelve a levantar.
#   3. Crea la tarea programada "Sibarita - Servidor": al iniciar Windows,
#      como SYSTEM, sin limite de tiempo.
#   4. La arranca y comprueba que responda en http://localhost:<Puerto>.
#
# Con el servicio corriendo, la app de escritorio de esta misma PC (modo
# "Esta PC es el servidor") sigue funcionando igual: usa el backend que ya
# responde en el puerto.
param(
    [string]$RutaSibarita = "",
    [int]$Puerto          = 3000,
    [string]$Carpeta      = "C:\SibaritaServidor",
    [string]$NombreTarea  = "Sibarita - Servidor",
    [switch]$Detener,
    [switch]$Iniciar,
    [switch]$Quitar
)

$ErrorActionPreference = "Stop"

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { throw "Hay que correr este script como administrador (clic derecho en PowerShell -> Ejecutar como administrador)." }

# Procesos del backend: Sibarita.exe corriendo server.js (NO la ventana de la app).
function Get-ProcesosBackend {
    Get-CimInstance Win32_Process -Filter "Name = 'Sibarita.exe' OR Name = 'cmd.exe'" |
        Where-Object { $_.CommandLine -match 'server\.js|iniciar_backend\.cmd' }
}

function Detener-Servicio {
    if (Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $NombreTarea
    }
    # Detener la tarea corta el .cmd pero no siempre el backend que lanzo.
    Get-ProcesosBackend | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "Servidor de Sibarita detenido." -ForegroundColor Yellow
}

# Sibarita responde 401 en /api/auth/perfil sin token (igual que "Probar conexion" de la app).
function Esperar-Respuesta([int]$segundos) {
    $limite = (Get-Date).AddSeconds($segundos)
    while ((Get-Date) -lt $limite) {
        try {
            Invoke-WebRequest "http://localhost:$Puerto/api/auth/perfil" -UseBasicParsing -TimeoutSec 3 | Out-Null
        } catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return $true }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Iniciar-Servicio {
    Start-ScheduledTask -TaskName $NombreTarea
    Write-Host "Esperando que el servidor responda en http://localhost:$Puerto ..."
    if (Esperar-Respuesta 60) {
        Write-Host "OK: Sibarita responde en el puerto $Puerto." -ForegroundColor Green
    } else {
        Write-Warning "No respondio en 60 segundos. Revisa $(Join-Path $Carpeta 'servidor-log.txt') (lo mas comun: PostgreSQL detenido o contrasena en backend/.env)."
    }
}

if ($Detener) { Detener-Servicio; return }
if ($Iniciar) { Iniciar-Servicio; return }
if ($Quitar) {
    Detener-Servicio
    if (Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false
    }
    Write-Host "Tarea '$NombreTarea' borrada. La carpeta $Carpeta (con el log) se deja." -ForegroundColor Yellow
    return
}

# 1. Donde esta instalado Sibarita.
if (-not $RutaSibarita) {
    $RutaSibarita = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Sibarita\Sibarita.exe"),
        (Join-Path $env:ProgramFiles "Sibarita\Sibarita.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Sibarita\Sibarita.exe")
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $RutaSibarita) { throw "No se encontro Sibarita.exe. Instala Sibarita en esta PC o indica la ruta con -RutaSibarita." }
}
if (-not (Test-Path $RutaSibarita)) { throw "No existe $RutaSibarita" }
$dirSibarita = Split-Path $RutaSibarita -Parent
$serverJs = Join-Path $dirSibarita "resources\app.asar\backend\server.js"
if (-not (Test-Path (Join-Path $dirSibarita "resources\app.asar"))) { throw "No se encontro resources\app.asar junto a $RutaSibarita" }
Write-Host "Sibarita encontrado en $dirSibarita"

# PostgreSQL tiene que arrancar solo con Windows, si no el backend no tiene base.
$pg = Get-Service "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pg) {
    Write-Warning "No se encontro el servicio de PostgreSQL en esta PC. El backend va a reintentar hasta que la base este disponible."
} elseif ($pg.StartType -ne "Automatic") {
    Write-Warning "El servicio $($pg.Name) no esta en inicio Automatico: despues de reiniciar la PC Sibarita no va a tener base. Cambialo en services.msc."
}

# Si el puerto ya esta ocupado (la app abierta en esta PC, o el servicio de
# antes), el backend nuevo no podria escuchar.
Detener-Servicio
if (Esperar-Respuesta 2) {
    throw "El puerto $Puerto ya esta en uso (probablemente la app Sibarita abierta en esta PC). Cierrala y vuelve a correr el script."
}

# 2. Lanzador con reintento.
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
$cmd = Join-Path $Carpeta "iniciar_backend.cmd"
$log = Join-Path $Carpeta "servidor-log.txt"
@"
@echo off
rem Generado por instalar_servicio.ps1 -- no editar, volver a correr el script.
set ELECTRON_RUN_AS_NODE=1
set PORT=$Puerto
cd /d "$dirSibarita"
:inicio
echo [%date% %time%] Iniciando backend de Sibarita >> "$log"
"$RutaSibarita" "$serverJs" >> "$log" 2>&1
echo [%date% %time%] El backend termino (codigo %errorlevel%), se reinicia en 10 s >> "$log"
timeout /t 10 /nobreak > nul
goto inicio
"@ | Set-Content -Path $cmd -Encoding ASCII
Write-Host "Lanzador escrito en $cmd"

# 3. Tarea programada: al iniciar Windows, como SYSTEM, sin limite de tiempo.
$accion    = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$cmd`""
$disparo   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$ajustes   = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparo `
    -Principal $principal -Settings $ajustes -Force | Out-Null
Write-Host "Tarea '$NombreTarea' creada (arranca con Windows)."

# 4. Arrancar y comprobar.
Iniciar-Servicio

Write-Host ""
Write-Host "Recordatorio: al instalar una version nueva de Sibarita en esta PC:" -ForegroundColor Cyan
Write-Host "  1) .\instalar_servicio.ps1 -Detener   2) instalar   3) .\instalar_servicio.ps1 -Iniciar" -ForegroundColor Cyan
