# Whisper-Wu local smoke test

This folder verifies `kaiwang0574/whisper-wu`, a PEFT/LoRA adapter for `openai/whisper-small`.
The smoke-test sample comes from `yuekai/WenetSpeech-Wu-ASR-Bench`.

## Setup

```powershell
$UV = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\uv.exe"
& $UV venv .venv-whisper-wu --python 3.11
& .\.venv-whisper-wu\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& $UV pip install --python .\.venv-whisper-wu\Scripts\python.exe -r .\scripts\whisper-wu\requirements.txt
```

## Run with your own Shanghai/Wu audio

```powershell
& .\.venv-whisper-wu\Scripts\python.exe .\scripts\whisper-wu\transcribe.py C:\path\to\shanghai-audio.wav --json
```

## Download one benchmark sample

```powershell
& .\.venv-whisper-wu\Scripts\python.exe .\scripts\whisper-wu\fetch_wu_sample.py --out .\scripts\whisper-wu\sample-wu.wav
& .\.venv-whisper-wu\Scripts\python.exe .\scripts\whisper-wu\transcribe.py .\scripts\whisper-wu\sample-wu.wav --json
```

Or run the local smoke test wrapper:

```powershell
.\scripts\whisper-wu\run-smoke.ps1
```

## Current local result

The environment loads `openai/whisper-small` and the `kaiwang0574/whisper-wu` LoRA adapter successfully.
On the first public benchmark sample, the reference text is:

```text
阿拉现在可以请理工大的老教授带了伊拉的孙子孙女
```

The local Whisper-Wu output was:

```text
他就哭一聽,連公大都知道了。
```

This proves the local model path runs, but it is not yet a satisfactory proof of Shanghai/Wu recognition quality.
