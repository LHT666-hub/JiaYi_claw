from __future__ import annotations

import json
import sys
from pathlib import Path

from transcribe import ADAPTER_MODEL, BASE_MODEL, load_model, transcribe_with_model


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main() -> None:
    processor, model, device = load_model()
    emit({"type": "ready", "baseModel": BASE_MODEL, "adapterModel": ADAPTER_MODEL, "device": device})

    for line in sys.stdin:
        try:
            request = json.loads(line)
            request_id = str(request["id"])
            result = transcribe_with_model(Path(request["audioPath"]), processor, model, device)
            emit({"type": "result", "id": request_id, "text": result["text"]})
        except Exception as error:
            emit({
                "type": "error",
                "id": str(request.get("id", "")) if "request" in locals() else "",
                "error": str(error),
            })


if __name__ == "__main__":
    main()
