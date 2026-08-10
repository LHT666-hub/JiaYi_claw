from __future__ import annotations

import argparse
from pathlib import Path

from datasets import Audio, load_dataset


DATASET_ID = "yuekai/WenetSpeech-Wu-ASR-Bench"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download one Wu benchmark sample for smoke testing.")
    parser.add_argument("--index", type=int, default=0, help="Dataset row index to export.")
    parser.add_argument("--out", type=Path, default=Path("sample-wu.wav"), help="Output wav path.")
    args = parser.parse_args()

    dataset = load_dataset(DATASET_ID, split="test", streaming=True)
    dataset = dataset.cast_column("audio", Audio(decode=False))
    row = next(iter(dataset.skip(args.index)))
    audio = row["audio"]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if audio.get("bytes"):
        args.out.write_bytes(audio["bytes"])
    elif audio.get("path"):
        args.out.write_bytes(Path(audio["path"]).read_bytes())
    else:
        raise RuntimeError("Dataset row does not contain audio bytes or path.")

    transcript = row.get("text") or row.get("transcription") or row.get("sentence") or ""
    print(f"audio={args.out}")
    if transcript:
        print(f"reference={transcript}")
    else:
        print("reference=<not found in dataset row>")


if __name__ == "__main__":
    main()
