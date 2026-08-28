# Alterna entre Postgres local (Docker) e Supabase de producao.
# Uso: .\scripts\switch-db.ps1 local   |   .\scripts\switch-db.ps1 supabase
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("local", "supabase")]
  [string]$Target
)

$envFile = Join-Path $PSScriptRoot "..\.env"
$backup  = Join-Path $PSScriptRoot "..\.env.supabase.bak"

if (-not (Test-Path $backup)) {
  Write-Error "Backup Supabase nao encontrado: $backup"
  exit 1
}

$content = Get-Content $envFile -Raw
$supa = (Get-Content $backup -Raw) -match 'DATABASE_URL="([^"]+)"' | Out-Null
$supaUrl = $Matches[1]

if ($Target -eq "local") {
  $newUrl = 'postgresql://dinamica:dinamica@localhost:5432/dinamica'
} else {
  $newUrl = $supaUrl
}

$newContent = [regex]::Replace($content, 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$newUrl`"")
Set-Content -Path $envFile -Value $newContent -NoNewline
Write-Host "DATABASE_URL -> $Target ($Target)"
Write-Host "Reinicie o servidor: npm run dev (na raiz do projeto)"
