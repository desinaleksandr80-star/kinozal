# Выпустить новую версию Кинозала одной командой:
#   .\release.ps1 1.2.0 "Что нового в этой версии"
# Поднимает версию, отправляет код на GitHub, собирает установщик и выкладывает релиз.
# У всех, у кого Кинозал установлен, он обновится сам при следующем запуске (или в течение 4 часов).
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = ''
)
# Не 'Stop': PowerShell 5.1 считает ошибкой любую строку, которую git/npm пишут в stderr (даже предупреждения).
# Успех внешних команд проверяем по коду возврата — функцией Step.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
function Step($what) { if ($LASTEXITCODE -ne 0) { throw "Не получилось: $what (код $LASTEXITCODE)" } }

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Версия должна быть вида 1.2.0' }
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }

Write-Host "Версия $Version" -ForegroundColor Cyan
npm version $Version --no-git-tag-version --allow-same-version | Out-Null; Step 'поднять версию'
git add -A; Step 'git add'
if (git status --porcelain) { git commit -m "Версия $Version"; Step 'git commit' }
git push; Step 'git push'

$env:GH_TOKEN = (& $gh auth token); Step 'получить токен GitHub (выполни: gh auth login)'

# Сборщик установщика (NSIS) не понимает пути длиннее 260 символов — если папка проекта
# лежит глубоко, собираем из копии в короткой папке %TEMP%\kinozal-build.
$build = $PSScriptRoot
if ($PSScriptRoot.Length -gt 60) {
  $build = Join-Path $env:TEMP 'kinozal-build'
  robocopy $PSScriptRoot $build /MIR /XD (Join-Path $PSScriptRoot 'dist') (Join-Path $PSScriptRoot '.git') /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'Не получилось скопировать проект для сборки' }
  $global:LASTEXITCODE = 0
}
Push-Location $build
try { npx electron-builder --win nsis --x64 --publish always; Step 'собрать и выложить' } finally { Pop-Location }
if ($Notes) { & $gh release edit "v$Version" --notes $Notes; Step 'добавить описание' }

Write-Host "Готово: версия $Version выложена. У всех обновится само." -ForegroundColor Green
