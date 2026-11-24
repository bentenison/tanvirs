<#
  Prepares the environment for `go test -race` on Windows.

  Go's race runtime links against libsynchronization (WaitOnAddress & co).
  Older MinGW toolchains such as TDM-GCC 5.x do not ship that import
  library, so linking fails with "undefined reference to WaitOnAddress".
  When needed, this script generates the import library with the
  toolchain's own dlltool into a temp folder and points CGO_LDFLAGS at it.
  Dot-source it:  . ./scripts/race-env.ps1
#>
$env:CGO_ENABLED = '1'
$gcc = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $gcc) {
  Write-Warning 'gcc not found: the race detector needs cgo and a C toolchain (e.g. MinGW-w64).'
  return
}
$gccDir = Split-Path $gcc.Source
$hasLib = Get-ChildItem (Join-Path $gccDir '..') -Recurse -Filter 'libsynchronization.a' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($hasLib) { return }

$dlltool = Join-Path $gccDir 'dlltool.exe'
if (-not (Test-Path $dlltool)) {
  Write-Warning 'dlltool not found; cannot generate libsynchronization.a. Install a newer MinGW-w64.'
  return
}
$dir = Join-Path ([System.IO.Path]::GetTempPath()) 'portfolio-racelib'
New-Item -ItemType Directory -Force $dir | Out-Null
$lib = Join-Path $dir 'libsynchronization.a'
if (-not (Test-Path $lib)) {
  $def = Join-Path $dir 'synchronization.def'
  @(
    'LIBRARY api-ms-win-core-synch-l1-2-0.dll',
    'EXPORTS',
    'WaitOnAddress',
    'WakeByAddressSingle',
    'WakeByAddressAll'
  ) | Set-Content -Encoding ascii $def
  & $dlltool -d $def -l $lib
}
$env:CGO_LDFLAGS = "-L$($dir -replace '\\', '/') -lsynchronization"
Write-Host "race: using generated $lib"
