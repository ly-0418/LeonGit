param(
    [switch]$SkipTests
)

# Builds the portable executable and the NSIS installer, then copies both into
# .\release with stable names so acceptance testing always uses one location.
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release = Join-Path $repo 'release'
$tauriConf = Get-Content (Join-Path $repo 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json
$version = $tauriConf.version
$started = Get-Date

Push-Location $repo
try {
    if (-not $SkipTests) {
        Write-Host '== unit tests ==' -ForegroundColor Cyan
        cargo test --manifest-path src-tauri/Cargo.toml --lib
        if ($LASTEXITCODE -ne 0) { throw ("cargo test failed with exit code " + $LASTEXITCODE) }
    }

    Write-Host '== release build (exe + NSIS installer) ==' -ForegroundColor Cyan
    pnpm exec tauri build --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw ("tauri build failed with exit code " + $LASTEXITCODE) }

    $exe = Join-Path $repo 'src-tauri\target\release\leongit.exe'
    if (-not (Test-Path $exe)) { throw ("missing exe: " + $exe) }

    $setup = Get-ChildItem (Join-Path $repo 'src-tauri\target\release\bundle\nsis') -Filter '*setup.exe' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $setup) { throw 'missing NSIS installer; check the bundle configuration.' }

    New-Item -ItemType Directory -Force -Path $release | Out-Null
    $portableOut = Join-Path $release ("LeonGit-" + $version + "-portable.exe")
    $setupOut = Join-Path $release ("LeonGit-" + $version + "-setup.exe")
    Copy-Item $exe $portableOut -Force
    Copy-Item $setup.FullName $setupOut -Force

    $commit = (git -C $repo rev-parse --short HEAD 2>$null)
    $dirty = 'clean'
    $status = git -C $repo status --porcelain 2>$null
    if ($status) { $dirty = 'dirty' }

    $portableHash = (Get-FileHash -Path $portableOut -Algorithm SHA256).Hash.ToLowerInvariant()
    $setupHash = (Get-FileHash -Path $setupOut -Algorithm SHA256).Hash.ToLowerInvariant()

    $lines = @(
        ("version  : " + $version)
        ("built    : " + $started.ToString('yyyy-MM-dd HH:mm:ss'))
        ("commit   : " + $commit + " (" + $dirty + ")")
        ''
        ("portable : " + (Split-Path -Leaf $portableOut) + '  ' + (Get-Item $portableOut).Length + ' bytes')
        ("sha256   : " + $portableHash)
        ''
        ("setup    : " + (Split-Path -Leaf $setupOut) + '  ' + (Get-Item $setupOut).Length + ' bytes')
        ("sha256   : " + $setupHash)
    )
    Set-Content -Path (Join-Path $release 'build-info.txt') -Value ($lines -join [Environment]::NewLine) -Encoding utf8

    Write-Host ''
    Write-Host '== artifacts ==' -ForegroundColor Green
    Write-Host ("portable : " + $portableOut)
    Write-Host ("setup    : " + $setupOut)
    Write-Host ("info     : " + (Join-Path $release 'build-info.txt'))
}
finally {
    Pop-Location
}
