# Muestra la(s) IP local(es) de esta PC en la red, para que los demas
# equipos sepan a que direccion entrar (http://<IP>:3000).
# No necesita permisos de administrador.

Write-Host "IP(s) de esta PC en la red local:" -ForegroundColor Cyan
Write-Host ""

Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    ForEach-Object {
        Write-Host ("  {0}  ->  http://{0}:3000" -f $_.IPAddress) -ForegroundColor Green
    }

Write-Host ""
Write-Host "Si hay varias, usa la de tu adaptador de red/WiFi real (no la de" -ForegroundColor Yellow
Write-Host "adaptadores virtuales de VPN, VirtualBox, Docker, etc)." -ForegroundColor Yellow
