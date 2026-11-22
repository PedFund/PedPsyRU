# Выполняет обязательные сценарии по порядку. Останавливается при падении smoke.
# Только изолированный стенд: BASE_URL обязан указывать на loopback.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$k6 = if ($env:K6_BIN) { $env:K6_BIN } else { 'k6' }
if (-not $env:BASE_URL) { $env:BASE_URL = 'http://127.0.0.1:4174' }
if ($env:BASE_URL -match 'vibemind\.pro') { throw 'REFUSING_TO_TEST_PRODUCTION' }
$out = Join-Path $root '..\..\..\audit\results'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Set-Location $root

function Run-Scenario([string]$file, [hashtable]$envs = @{}) {
  foreach ($key in $envs.Keys) { Set-Item -Path ("env:" + $key) -Value $envs[$key] }
  $summary = Join-Path $out ($file.Replace('.js','') + '.json')
  Write-Host "=== $file ==="
  & $k6 run --summary-export=$summary $file
  if ($LASTEXITCODE -ne 0) { Write-Warning "$file exited with $LASTEXITCODE (порог или отказ)" }
}

Run-Scenario 'smoke.js'
if ($LASTEXITCODE -ne 0) { throw 'SMOKE_FAILED: нагрузка не запускается' }

Run-Scenario 'login.js' @{ VUS = '200' }
Run-Scenario 'registration.js' @{ VUS = '50'; RUN_ID = 'run-' + (Get-Date -Format 'HHmmss') }
Run-Scenario 'exam.js' @{ VUS = '100'; RAMP = '1m'; HOLD = '5m' }
Run-Scenario 'completion.js' @{ VUS = '30' }
Run-Scenario 'conflict.js' @{ VUS = '10' }
