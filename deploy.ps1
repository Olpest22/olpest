<#
.SYNOPSIS
  Выкладка olpest на VPS. Трогает только /opt/olpest и контейнер olpest-web — Omad не затрагивается.

.EXAMPLE
  .\deploy.ps1 -Server root@186.246.3.210 -Domain olpest.ru

.NOTES
  Нужны встроенные в Windows 10/11 ssh, scp и tar.
  Пользователь на сервере должен иметь права на docker и на запись в /opt.
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$Domain
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$stage = Join-Path $env:TEMP ('olpest-release-' + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $env:TEMP 'olpest-release.tar.gz'

try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  foreach ($item in 'site', 'deploy', 'Dockerfile', 'Caddyfile', 'docker-compose.yml') {
    Copy-Item -Path (Join-Path $root $item) -Destination $stage -Recurse
  }

  # домен в мета-тегах превью (og:url, og:image)
  $index = Join-Path $stage 'site\index.html'
  $html = [IO.File]::ReadAllText($index, $utf8).Replace('https://example.com/', "https://$Domain/")
  [IO.File]::WriteAllText($index, $html, $utf8)

  # LF-переводы строк для файлов, которые читает Linux
  $lfFiles = @(Get-ChildItem (Join-Path $stage 'deploy') -Filter *.sh) + @(Get-Item (Join-Path $stage 'Caddyfile'), (Join-Path $stage 'docker-compose.yml'), (Join-Path $stage 'Dockerfile'))
  foreach ($f in $lfFiles) {
    $t = [IO.File]::ReadAllText($f.FullName, $utf8).Replace("`r`n", "`n")
    [IO.File]::WriteAllText($f.FullName, $t, $utf8)
  }

  if (Test-Path $archive) { Remove-Item $archive -Force }
  tar -czf $archive -C $stage .
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось упаковать архив (tar).' }

  Write-Host "Загружаю на $Server…"
  scp $archive "${Server}:/tmp/olpest-release.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось загрузить архив (scp).' }

  ssh $Server "rm -rf /tmp/olpest-release && mkdir -p /tmp/olpest-release && tar -xzf /tmp/olpest-release.tar.gz -C /tmp/olpest-release && bash /tmp/olpest-release/deploy/server-install.sh /tmp/olpest-release"
  if ($LASTEXITCODE -ne 0) { throw 'Установка на сервере завершилась с ошибкой — смотрите вывод выше.' }

  Write-Host "Готово: olpest выложен на $Server ($Domain)" -ForegroundColor Green
}
finally {
  Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
  Remove-Item -Force $archive -ErrorAction SilentlyContinue
}
