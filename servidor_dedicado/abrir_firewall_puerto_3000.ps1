# Abre el puerto 3000 (Sibarita) en el Firewall de Windows para que otras
# PCs de la red local puedan conectarse. Correr como Administrador.
#
# Uso: clic derecho sobre este archivo -> "Ejecutar con PowerShell"
# (Windows puede pedir permisos de administrador; aceptar).

$reglaNombre = "Sibarita (puerto 3000)"

$existente = Get-NetFirewallRule -DisplayName $reglaNombre -ErrorAction SilentlyContinue
if ($existente) {
    Write-Host "La regla '$reglaNombre' ya existe. No se crea de nuevo." -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName $reglaNombre `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 3000 `
        -Action Allow `
        -Profile Private,Domain | Out-Null
    Write-Host "Regla de firewall creada: $reglaNombre (entrante, TCP 3000, redes privadas/dominio)." -ForegroundColor Green
}

Write-Host ""
Write-Host "Listo. Ahora corre ver_ip_local.ps1 para saber que direccion usar desde otras PCs." -ForegroundColor Cyan
