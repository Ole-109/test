<#
  Waypoint wish export for Windows (no install needed).

  Finds the wish history link the game caches when you open Wish > History,
  downloads your complete wish history from HoYoverse and saves it as a
  UIGF v4 file that Waypoint (and paimon.moe, Snap Hutao, ...) can import.

  Run in PowerShell:
    iwr -useb https://raw.githubusercontent.com/Ole-109/test/main/tools/export.ps1 | iex

  Or with options (save the script first):
    .\export.ps1 [global|china] [-Url <link>] [-GameDir <path>] [-OutDir <path>] [-LinkOnly]
                  [-Full [-Cookie "ltoken_v2=...; ltuid_v2=..."] [-Uid <uid>]]

  This file is ASCII-only on purpose: Windows PowerShell 5.1 decodes downloaded
  scripts with the system code page, which would garble other characters.
#>
param(
  [Parameter(Position = 0)][string]$Region = 'auto',
  [string]$Url,
  [string]$GameDir,
  [string]$OutDir,
  [switch]$LinkOnly,
  # Full export (characters, artifacts, resin...) via the Node.js exporter, if Node 18+ is installed.
  [switch]$Full,
  [string]$Cookie,
  [string]$Uid,
  # For testing against a mock server.
  [string]$ApiHost
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch {}

function Write-Step($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Write-Ok($m) { Write-Host "[ok] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host "[x] $m" -ForegroundColor Red }

$GlobalHost = 'https://public-operation-hk4e-sg.hoyoverse.com'
$ChinaHost = 'https://public-operation-hk4e.mihoyo.com'
$ApiPath = '/gacha_info/api/getGachaLog'
$BannerNames = [ordered]@{ '301' = 'Character Event'; '302' = 'Weapon Event'; '500' = 'Chronicled'; '200' = 'Standard'; '100' = 'Beginners' }

# --- Locating the game ---------------------------------------------------

function Get-HomeDir {
  if ($env:USERPROFILE) { return $env:USERPROFILE }
  return $HOME
}

function Find-GameDataDir {
  # "Genshin Impact" (global) and the Chinese client folder name, built from
  # char codes to keep this file ASCII.
  $folders = @('Genshin Impact', ("" + [char]0x539F + [char]0x795E))
  if ($Region -eq 'china') { [array]::Reverse($folders) }
  foreach ($folder in $folders) {
    foreach ($file in @('output_log.txt', 'Player.log')) {
      $log = Join-Path (Get-HomeDir) "AppData\LocalLow\miHoYo\$folder\$file"
      if (-not (Test-Path -LiteralPath $log)) { continue }
      $text = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
      if (-not $text) { continue }
      $m = [regex]::Match($text, '([A-Za-z]:[\\/][^\r\n:]*?(GenshinImpact_Data|YuanShen_Data))')
      if ($m.Success -and (Test-Path -LiteralPath $m.Groups[1].Value)) { return $m.Groups[1].Value }
    }
  }
  return $null
}

function Resolve-DataDir([string]$dir) {
  if ($dir -match '_Data[\\/]?$') { return $dir }
  foreach ($sub in @('GenshinImpact_Data', 'YuanShen_Data')) {
    $candidate = Join-Path $dir $sub
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $dir
}

function Find-CacheFile([string]$dataDir) {
  $root = Join-Path $dataDir 'webCaches'
  if (-not (Test-Path -LiteralPath $root)) { return $null }
  $files = @()
  $legacy = Join-Path $root 'Cache\Cache_Data\data_2'
  if (Test-Path -LiteralPath $legacy) { $files += Get-Item -LiteralPath $legacy }
  foreach ($v in Get-ChildItem -LiteralPath $root -Directory) {
    $f = Join-Path $v.FullName 'Cache\Cache_Data\data_2'
    if (Test-Path -LiteralPath $f) { $files += Get-Item -LiteralPath $f }
  }
  if (-not $files) { return $null }
  return ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

function Get-CachedLinks([string]$cacheFile) {
  # The game keeps the file open; read a copy.
  $tmp = [IO.Path]::GetTempFileName()
  try {
    Copy-Item -LiteralPath $cacheFile -Destination $tmp -Force
    $bytes = [IO.File]::ReadAllBytes($tmp)
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
  $text = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
  $pattern = 'https://[^\s"''<>\x00]+?(?:getGachaLog|e20190909gacha|gacha-v\d|webview_gacha)[^\s"''<>\x00]*'
  $links = New-Object System.Collections.Generic.List[string]
  foreach ($m in [regex]::Matches($text, $pattern)) {
    $u = ($m.Value -split '[\x00-\x1f]')[0]
    if ($u.Contains('authkey=') -and -not $links.Contains($u)) { $links.Add($u) }
  }
  return $links
}

# --- API -----------------------------------------------------------------

function Get-LinkParams([string]$link) {
  $query = $link
  $q = $link.IndexOf('?')
  if ($q -ge 0) { $query = $link.Substring($q + 1) }
  $query = ($query -split '#')[0]
  $params = [ordered]@{}
  foreach ($pair in $query -split '&') {
    if (-not $pair) { continue }
    $i = $pair.IndexOf('=')
    if ($i -lt 1) { continue }
    # Values stay URL-encoded as they were in the link.
    $params[$pair.Substring(0, $i)] = $pair.Substring($i + 1)
  }
  if (-not $params.Contains('authkey')) { throw 'The link has no authkey. Open the wish history in game, then try again.' }
  return $params
}

function Get-ApiHost([string]$link, $params) {
  if ($ApiHost) { return $ApiHost }
  $r = ''
  if ($params.Contains('region')) { $r = [string]$params['region'] }
  if ($Region -eq 'china' -or $link -match '://[^/]*mihoyo\.com' -or $r.StartsWith('cn_')) { return $ChinaHost }
  return $GlobalHost
}

function Get-PageUrl($base, $params, [string]$gachaType, [string]$endId, [int]$size) {
  $p = [ordered]@{}
  foreach ($k in $params.Keys) { if ($k -ne 'timestamp') { $p[$k] = $params[$k] } }
  $p['gacha_type'] = $gachaType
  $p['page'] = '1'
  $p['size'] = [string]$size
  $p['end_id'] = $endId
  $p['lang'] = 'en-us'
  $pairs = foreach ($k in $p.Keys) { "$k=$($p[$k])" }
  return "$base$ApiPath`?" + ($pairs -join '&')
}

function Invoke-Gacha([string]$uri) {
  for ($attempt = 0; $attempt -lt 6; $attempt++) {
    $res = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 30 -UseBasicParsing
    if ($res.retcode -eq -110) { Start-Sleep -Seconds ($attempt + 1); continue }
    return $res
  }
  return $res
}

function Assert-Ok($res) {
  if ($res.retcode -eq 0) { return }
  switch ($res.retcode) {
    -101 { throw 'The link has expired (links last about a day). Open the wish history in game again.' }
    -100 { throw 'The link is not valid. Open the wish history in game again.' }
    -110 { throw 'HoYoverse is rate-limiting requests. Wait a minute and try again.' }
    default { throw "Wish history server error: $($res.message) ($($res.retcode))" }
  }
}

function Test-Link([string]$link) {
  try {
    $params = Get-LinkParams $link
    $res = Invoke-Gacha (Get-PageUrl (Get-ApiHost $link $params) $params '301' '0' 1)
    return ($res.retcode -eq 0)
  } catch { return $false }
}

# --- Main ----------------------------------------------------------------

Write-Host ''
Write-Host 'Waypoint wish export' -ForegroundColor White
Write-Host ''

$link = $null
if ($Url) {
  $link = $Url.Trim()
} else {
  Write-Step 'Looking for the game...'
  $dataDir = $null
  if ($GameDir) { $dataDir = Resolve-DataDir $GameDir } else { $dataDir = Find-GameDataDir }
  if (-not $dataDir) {
    Write-Fail 'Could not find the game. Start Genshin Impact once, or pass -GameDir "D:\Games\Genshin Impact game".'
    return
  }
  Write-Host "  $dataDir" -ForegroundColor DarkGray
  $cache = Find-CacheFile $dataDir
  if (-not $cache) {
    Write-Fail 'No web cache found. In game, open Wish > History and wait until it loads, then run this again.'
    return
  }
  $links = Get-CachedLinks $cache
  if ($links.Count -eq 0) {
    Write-Fail 'No wish history link in the cache. Open Wish > History in game, wait until it loads, then run this again.'
    return
  }
  Write-Step "Checking $($links.Count) cached link(s), newest first..."
  for ($i = $links.Count - 1; $i -ge 0; $i--) {
    if (Test-Link $links[$i]) { $link = $links[$i]; break }
    Start-Sleep -Milliseconds 300
  }
  if (-not $link) {
    Write-Fail 'All cached links have expired. Open Wish > History in game again, then rerun.'
    return
  }
}

try { Set-Clipboard -Value $link } catch {}
Write-Ok 'Wish history link found (copied to the clipboard).'
if ($LinkOnly) {
  Write-Host ''
  Write-Host $link
  Write-Host ''
  Write-Host 'Paste it into Waypoint > Wishes > Import.' -ForegroundColor DarkGray
  return
}

if (-not $OutDir) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  if ($desktop -and (Test-Path -LiteralPath $desktop)) { $OutDir = $desktop } else { $OutDir = (Get-Location).Path }
}

if ($Full) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Warn 'Node.js is not installed, so only the wish history is exported. Get it from https://nodejs.org for the full export.'
  } else {
    $cli = Join-Path ([IO.Path]::GetTempPath()) 'waypoint-export.mjs'
    Write-Step 'Downloading the full exporter...'
    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Ole-109/test/main/tools/dist/waypoint-export.mjs' -OutFile $cli -UseBasicParsing
    $cliArgs = @($cli, 'all', '--url', $link, '--out', (Join-Path $OutDir ("waypoint-export-{0}.json" -f (Get-Date -Format 'yyyyMMdd'))))
    if ($Cookie) { $cliArgs += @('--cookie', $Cookie) }
    if ($Uid) { $cliArgs += @('--uid', $Uid) }
    & $node.Source @cliArgs
    return
  }
}

$params = Get-LinkParams $link
$apiBase = Get-ApiHost $link $params
$records = New-Object System.Collections.ArrayList
$uid = $null

try {
  foreach ($type in $BannerNames.Keys) {
    $endId = '0'
    $page = 1
    $count = 0
    while ($true) {
      $res = Invoke-Gacha (Get-PageUrl $apiBase $params $type $endId 20)
      Assert-Ok $res
      $list = @($res.data.list)
      foreach ($item in $list) {
        if (-not $uid) { $uid = [string]$item.uid }
        $uigfType = [string]$item.gacha_type
        if ($uigfType -eq '400') { $uigfType = '301' }
        [void]$records.Add([ordered]@{
            uigf_gacha_type = $uigfType
            gacha_type      = [string]$item.gacha_type
            item_id         = [string]$item.item_id
            count           = '1'
            time            = [string]$item.time
            name            = [string]$item.name
            item_type       = [string]$item.item_type
            rank_type       = [string]$item.rank_type
            id              = [string]$item.id
          })
        $count++
      }
      Write-Host ("`r  {0,-16} page {1,3} - {2} wishes" -f $BannerNames[$type], $page, $count) -NoNewline
      if ($list.Count -lt 20) { break }
      $endId = [string]$list[$list.Count - 1].id
      $page++
      Start-Sleep -Milliseconds 350
    }
    Write-Host ''
    Start-Sleep -Milliseconds 350
  }
} catch {
  Write-Host ''
  Write-Fail $_.Exception.Message
  return
}

if (-not $uid) { $uid = '0' }
$tz = 8
if ($uid.StartsWith('6')) { $tz = -5 } elseif ($uid.StartsWith('7')) { $tz = 1 }
$export = [ordered]@{
  info = [ordered]@{
    export_timestamp   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    export_app         = 'Waypoint export.ps1'
    export_app_version = '2.0'
    version            = 'v4.0'
  }
  hk4e = @(
    [ordered]@{
      uid      = $uid
      timezone = $tz
      lang     = 'en-us'
      list     = $records.ToArray()
    }
  )
}

$file = Join-Path $OutDir ("waypoint-wishes-{0}-{1}.json" -f $uid, (Get-Date -Format 'yyyyMMdd'))
$json = ConvertTo-Json -InputObject $export -Depth 8 -Compress
# UTF-8 without BOM.
[IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Ok "$($records.Count) wishes saved to $file"
Write-Host 'Import it in Waypoint: Wishes > Import > choose file.' -ForegroundColor DarkGray
