from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import types
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor


BASE_MODEL = "openai/whisper-small"
LOCAL_ADAPTER = Path(__file__).resolve().parent / "model" / "whisper-wu-adapter"
ADAPTER_MODEL = os.getenv(
    "WHISPER_WU_ADAPTER_PATH",
    str(LOCAL_ADAPTER) if LOCAL_ADAPTER.exists() else "kaiwang0574/whisper-wu",
)
SAMPLE_RATE = 16000


def ensure_torch_compat() -> None:
    if hasattr(torch, "distributed") and not hasattr(torch.distributed, "tensor"):
        torch.distributed.tensor = types.SimpleNamespace(DTensor=type("_DummyDTensor", (), {}))


def load_audio(audio_path: Path) -> np.ndarray:
    try:
        audio, sr = sf.read(audio_path, dtype="float32")
    except Exception:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(audio_path),
                    "-ar",
                    str(SAMPLE_RATE),
                    "-ac",
                    "1",
                    "-f",
                    "wav",
                    str(tmp_path),
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise ValueError(f"ffmpeg failed: {result.stderr[:500]}")
            audio, sr = sf.read(tmp_path, dtype="float32")
        finally:
            tmp_path.unlink(missing_ok=True)

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    if sr != SAMPLE_RATE:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)

    abs_audio = np.abs(audio)
    voice_indices = np.where(abs_audio > 0.01)[0]
    if len(voice_indices) > 0:
        start = max(0, voice_indices[0] - int(0.1 * SAMPLE_RATE))
        end = min(len(audio), voice_indices[-1] + int(0.1 * SAMPLE_RATE))
        audio = audio[start:end]

    return audio[: 30 * SAMPLE_RATE]


def load_model():
    ensure_torch_compat()
    device = "cuda:0" if torch.cuda.is_available() else "cpu"

    processor = WhisperProcessor.from_pretrained(BASE_MODEL)
    base_model = WhisperForConditionalGeneration.from_pretrained(BASE_MODEL).to(device)
    model = PeftModel.from_pretrained(base_model, ADAPTER_MODEL)
    model.to(device)
    model.eval()
    return processor, model, device


def transcribe_with_model(audio_path: Path, processor, model, device: str) -> dict:
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    audio = load_audio(audio_path)
    if len(audio) < int(0.15 * SAMPLE_RATE) or float(np.max(np.abs(audio), initial=0)) < 0.005:
        raise ValueError("NO_SPEECH_DETECTED")

    inputs = processor(
        audio,
        sampling_rate=SAMPLE_RATE,
        return_tensors="pt",
        return_attention_mask=True,
    )
    input_features = inputs.input_features.to(device)
    forced_decoder_ids = processor.get_decoder_prompt_ids(language="chinese", task="transcribe")

    generate_args = {
        "input_features": input_features,
        "forced_decoder_ids": forced_decoder_ids,
        "max_length": 225,
        "repetition_penalty": 1.2,
    }
    if hasattr(inputs, "attention_mask"):
        generate_args["attention_mask"] = inputs.attention_mask.to(device)

    with torch.no_grad():
        predicted_ids = model.generate(**generate_args)

    text = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()
    return {
        "audio": str(audio_path),
        "text": text,
    }


def transcribe(audio_path: Path) -> dict:
    processor, model, device = load_model()
    return transcribe_with_model(audio_path, processor, model, device)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Whisper-Wu ASR on an audio file.")
    parser.add_argument("audio", type=Path, help="Path to wav/mp3/m4a audio.")
    parser.add_argument("--json", action="store_true", help="Print full JSON output.")
    args = parser.parse_args()

    result = transcribe(args.audio)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result["text"])


if __name__ == "__main__":
    main()
