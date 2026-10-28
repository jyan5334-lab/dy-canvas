$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$testDirectory = Join-Path $projectDirectory ('release\shortcut-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$programDirectory = Join-Path $testDirectory ('program-' + [char]0x7A0B + [char]0x5E8F)
New-Item -ItemType Directory -Path $programDirectory | Out-Null
$target = Join-Path $programDirectory 'WirelessCanvas.exe'
$otherTarget = Join-Path $testDirectory 'other.exe'
New-Item -ItemType File -Path $target, $otherTarget | Out-Null
$icon = Join-Path $projectDirectory 'desktop\icon.ico'
$shell = New-Object -ComObject WScript.Shell
$migration = Join-Path $PSScriptRoot 'refresh-shortcuts.vbs'
$scriptHost = Join-Path $env:WINDIR 'System32\cscript.exe'
if (Test-Path -LiteralPath (Join-Path $env:WINDIR 'SysWOW64\cscript.exe')) {
  $scriptHost = Join-Path $env:WINDIR 'SysWOW64\cscript.exe'
}

function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function Set-TestLink($filename, $executable) {
  $link = $shell.CreateShortcut($filename)
  $link.TargetPath = $executable
  $link.IconLocation = "$executable,0"
  $link.Description = 'Old brand'
  $link.Save()
}
function New-Case($name) {
  $directory = Join-Path $testDirectory $name
  New-Item -ItemType Directory -Path $directory | Out-Null
  $legacy = 'DY' + [char]0x753B + [char]0x5E03
  return @((Join-Path $directory 'DYcanvas-desktop.lnk'), (Join-Path $directory 'DYcanvas-menu.lnk'), (Join-Path $directory "$legacy-desktop.lnk"), (Join-Path $directory "$legacy-menu.lnk"))
}
function Invoke-Migration($links, $create) {
  & $scriptHost '//B' '//NoLogo' $migration $target $icon 'DYcanvas' $links[0] $links[1] $links[2] $links[3] $create $create
  Assert-True ($LASTEXITCODE -eq 0) "Shortcut migration failed: $LASTEXITCODE"
}
function Assert-Brand($filename) {
  Assert-True (Test-Path -LiteralPath $filename) "Missing link: $filename"
  $link = $shell.CreateShortcut($filename)
  Assert-True ($link.TargetPath -eq $target) 'Executable changed'
  Assert-True ($link.IconLocation -eq "$icon,0") 'Icon was not refreshed'
  Assert-True ($link.Description -eq 'DYcanvas') 'Shortcut description was not refreshed'
}

$links = New-Case 'legacy'
Set-TestLink $links[2] $target
Set-TestLink $links[3] $target
Invoke-Migration $links 'false'
Assert-Brand $links[0]
Assert-Brand $links[1]
Assert-True (-not (Test-Path -LiteralPath $links[2])) 'Old desktop link remains'
Assert-True (-not (Test-Path -LiteralPath $links[3])) 'Old menu link remains'

$links = New-Case 'nsis-renamed'
Set-TestLink $links[0] $target
Set-TestLink $links[1] $target
Invoke-Migration $links 'false'
Assert-Brand $links[0]
Assert-Brand $links[1]

$links = New-Case 'deleted'
Invoke-Migration $links 'false'
Assert-True (-not (Test-Path -LiteralPath $links[0])) 'Deleted desktop shortcut was recreated'
Assert-True (-not (Test-Path -LiteralPath $links[1])) 'Deleted menu shortcut was recreated'

$links = New-Case 'fresh'
Invoke-Migration $links 'true'
Assert-Brand $links[0]
Assert-Brand $links[1]

$links = New-Case 'unrelated'
Set-TestLink $links[0] $otherTarget
Set-TestLink $links[2] $target
Invoke-Migration $links 'false'
Assert-True ($shell.CreateShortcut($links[0]).TargetPath -eq $otherTarget) 'Unrelated shortcut changed'
Assert-True (Test-Path -LiteralPath $links[2]) 'Legacy link removed despite a name conflict'

$links = New-Case 'duplicates'
Set-TestLink $links[0] $target
Set-TestLink $links[2] $target
Invoke-Migration $links 'false'
Assert-Brand $links[0]
Assert-True (-not (Test-Path -LiteralPath $links[2])) 'Duplicate old shortcut remains'

Write-Output "PASS: rename, icon refresh, NSIS-kept links, deleted links, fresh install, conflicts, duplicates"
Write-Output "Fixtures: $testDirectory"
