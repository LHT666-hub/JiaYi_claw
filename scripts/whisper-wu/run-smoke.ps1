$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$python = Join-Path $repoRoot ".venv-whisper-wu\Scripts\python.exe"
$ffmpegBin = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin"

if (-not (Test-Path $python)) {
  throw "Python environment not found: $python"
}

$env:PATH = "$ffmpegBin;$env:PATH"
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"

$sample = Join-Path $PSScriptRoot "sample-wu.wav"
& $python (Join-Path $PSScriptRoot "fetch_wu_sample.py") --out $sample
& $python (Join-Path $PSScriptRoot "transcribe.py") $sample --json
