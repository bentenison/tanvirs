<#
.SYNOPSIS
  Builds the portfolio into standalone executables with the frontend embedded.

.DESCRIPTION
  1. Installs frontend dependencies from the lockfile (npm ci)
  2. Type-checks the frontend
  3. Runs frontend unit tests
  4. Builds, prerenders and precompresses the frontend
  5. Copies the result into internal/web/dist for go:embed
  6. Runs go vet and go test (optionally with -race)
  7. Cross-compiles static binaries (CGO_ENABLED=0) into ./bin

.EXAMPLE
  ./scripts/build.ps1
  ./scripts/build.ps1 -Targets windows/amd64 -SkipTests
  ./scripts/build.ps1 -Race -BaseUrl https://example.com
#>
[CmdletBinding()]
param(
  [string[]]$Targets = @('windows/amd64', 'linux/amd64', 'linux/arm64'),
  [switch]$SkipTests,
  [switch]$Race,
  [string]$BaseUrl = '',
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$embedDir = Join-Path $root 'internal\web\dist'
$binDir = Join-Path $root 'bin'

function Step([string]$name) { Write-Host "`n==> $name" -ForegroundColor Cyan }
function Invoke-Checked([string]$what, [scriptblock]$block) {
  # Exit codes decide success. With 'Stop', Windows PowerShell 5.1 turns any
  # redirected stderr line (e.g. a build warning) into a terminating error.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $block } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

if (-not $Version) {
  $Version = (Get-Date -Format 'yyyy.MM.dd-HHmm')
}

Push-Location $frontend
try {
  Step 'Installing frontend dependencies (npm ci)'
  Invoke-Checked 'npm ci' { npm ci --no-audit --no-fund }

  Step 'Type-checking frontend'
  Invoke-Checked 'typecheck' { npm run typecheck }

  if (-not $SkipTests) {
    Step 'Running frontend unit tests'
    Invoke-Checked 'frontend tests' { npm test }
  }

  Step 'Building frontend (client, prerender, compress)'
  if ($BaseUrl) { $env:VITE_BASE_URL = $BaseUrl }
  try { Invoke-Checked 'frontend build' { npm run build } }
  finally { Remove-Item Env:VITE_BASE_URL -ErrorAction SilentlyContinue }
}
finally { Pop-Location }

Step 'Copying frontend into internal/web/dist'
Get-ChildItem $embedDir -Force | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Recurse -Force
Copy-Item (Join-Path $frontend 'dist\client\*') $embedDir -Recurse -Force
if (-not (Test-Path (Join-Path $embedDir 'index.html'))) { throw 'index.html missing from embedded dist' }

Push-Location $root
try {
  Step 'go vet'
  Invoke-Checked 'go vet' { go vet ./... }

  if (-not $SkipTests) {
    if ($Race) {
      Step 'go test -race'
      . (Join-Path $PSScriptRoot 'race-env.ps1')
      Invoke-Checked 'go test -race' { go test -race -count=1 ./... }
    }
    else {
      Step 'go test'
      Invoke-Checked 'go test' { go test -count=1 ./... }
    }
  }

  New-Item -ItemType Directory -Force $binDir | Out-Null
  $env:CGO_ENABLED = '0'
  try {
    foreach ($t in $Targets) {
      $os, $arch = $t.Split('/')
      $ext = if ($os -eq 'windows') { '.exe' } else { '' }
      $out = Join-Path $binDir "portfolio-$os-$arch$ext"
      Step "go build $t -> $out"
      $env:GOOS = $os
      $env:GOARCH = $arch
      Invoke-Checked "go build $t" { go build -trimpath -ldflags "-s -w -X main.version=$Version" -o $out . }
    }
  }
  finally {
    Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED -ErrorAction SilentlyContinue
  }
}
finally { Pop-Location }

Step 'Done'
Get-ChildItem $binDir | Select-Object Name, @{ n = 'MiB'; e = { [math]::Round($_.Length / 1MB, 1) } } | Format-Table -AutoSize
