"""Tests for dataset auditing and note-event evaluation."""
import csv
import json
import struct
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ml.evaluate_notes import evaluate, load_notes
from ml.prepare_dataset import prepare


def write_wav(path: Path, seconds: float, rate: int = 16000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = int(seconds * rate)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(struct.pack("<" + "h" * frames, *([0] * frames)))


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    raw = root / "raw"
    for session in ("session_a", "session_b", "session_c", "session_d"):
        write_wav(raw / session / "take.wav", 1.0)
    (raw / "session_bad").mkdir()
    (raw / "session_bad" / "broken.wav").write_text("not audio")
    manifest = root / "manifest.csv"
    report_path = root / "report.json"
    report = prepare(raw, manifest, report_path, seed=7)
    rows = list(csv.DictReader(manifest.open(encoding="utf-8")))
    assert len(rows) == 4
    assert len({row["session"] for row in rows}) == 4
    by_session = {}
    for row in rows:
        by_session.setdefault(row["session"], set()).add(row["split"])
    assert all(len(splits) == 1 for splits in by_session.values())
    assert {row["split"] for row in rows} == {"train", "validation", "test"}
    assert report["rejected"][0]["path"] == "session_bad/broken.wav"
    assert json.loads(report_path.read_text())["file_count"] == 4

    reference_path = root / "reference.csv"
    prediction_path = root / "prediction.csv"
    reference_path.write_text("onset,offset,midi\n0.0,0.5,60\n1.0,1.5,62\n2.0,2.5,64\n")
    prediction_path.write_text("onset,offset,midi\n0.01,0.51,60\n1.03,1.48,62\n2.0,2.5,65\n")
    metrics = evaluate(load_notes(reference_path), load_notes(prediction_path))
    assert metrics["true_positive"] == 2
    assert metrics["precision"] == 0.666667
    assert metrics["recall"] == 0.666667
    assert metrics["f1"] == 0.666667

print("PASS: session-safe dataset split, WAV rejection, manifest report, and note-event metrics.")
