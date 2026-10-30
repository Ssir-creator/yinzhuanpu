"""Audit PCM WAV files and split complete recording sessions without leakage."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import sys
import wave
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "ml" / "data" / "raw"
DEFAULT_MANIFEST = ROOT / "ml" / "data" / "manifest.csv"
DEFAULT_REPORT = ROOT / "ml" / "data" / "dataset_report.json"


def inspect_wav(path: Path) -> dict:
    with wave.open(str(path), "rb") as audio:
        frames = audio.getnframes()
        rate = audio.getframerate()
        channels = audio.getnchannels()
        width = audio.getsampwidth()
        compression = audio.getcomptype()
    if compression != "NONE":
        raise ValueError(f"unsupported WAV compression: {compression}")
    if rate <= 0 or frames <= 0:
        raise ValueError("empty or invalid WAV")
    if channels not in (1, 2):
        raise ValueError(f"expected mono or stereo, got {channels} channels")
    if width not in (2, 3, 4):
        raise ValueError(f"expected 16/24/32-bit PCM, got {width * 8}-bit")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "duration_seconds": round(frames / rate, 6),
        "sample_rate": rate,
        "channels": channels,
        "bit_depth": width * 8,
        "sha256": digest.hexdigest(),
    }


def allocate_sessions(session_names: list[str], seed: int) -> dict[str, str]:
    names = sorted(session_names)
    random.Random(seed).shuffle(names)
    if len(names) < 3:
        return {name: "train" for name in names}
    test_count = max(1, round(len(names) * 0.15))
    validation_count = max(1, round(len(names) * 0.15))
    while test_count + validation_count >= len(names):
        if validation_count > 1:
            validation_count -= 1
        else:
            test_count -= 1
    result = {}
    for index, name in enumerate(names):
        if index < test_count:
            result[name] = "test"
        elif index < test_count + validation_count:
            result[name] = "validation"
        else:
            result[name] = "train"
    return result


def prepare(input_dir: Path, manifest_path: Path, report_path: Path, seed: int) -> dict:
    files = sorted(input_dir.rglob("*.wav")) if input_dir.exists() else []
    rows, rejected = [], []
    for path in files:
        relative = path.relative_to(input_dir)
        session = relative.parts[0] if len(relative.parts) > 1 else "unassigned"
        try:
            info = inspect_wav(path)
        except (ValueError, wave.Error, EOFError) as error:
            rejected.append({"path": relative.as_posix(), "reason": str(error)})
            continue
        rows.append({"path": relative.as_posix(), "session": session, **info})

    assignments = allocate_sessions(sorted({row["session"] for row in rows}), seed)
    for row in rows:
        row["split"] = assignments[row["session"]]

    durations = defaultdict(float)
    counts = defaultdict(int)
    for row in rows:
        durations[row["split"]] += row["duration_seconds"]
        counts[row["split"]] += 1

    sessions = sorted(assignments)
    warnings = []
    if "unassigned" in sessions:
        warnings.append("Files in the raw root are not a distinct recording session.")
    if len(sessions) < 3:
        warnings.append("At least 3 recording sessions are required for isolated train/validation/test splits.")
    if durations["train"] < 1800:
        warnings.append("Training audio is below the 30-minute prototype minimum.")
    if durations["test"] < 300:
        warnings.append("Independent test audio is below the 5-minute prototype minimum.")
    if rejected:
        warnings.append(f"{len(rejected)} WAV file(s) were rejected.")

    report = {
        "ready_for_prototype_training": not warnings,
        "seed": seed,
        "file_count": len(rows),
        "session_count": len(sessions),
        "sessions": assignments,
        "duration_seconds": {name: round(durations[name], 3) for name in ("train", "validation", "test")},
        "file_counts": {name: counts[name] for name in ("train", "validation", "test")},
        "rejected": rejected,
        "warnings": warnings,
    }

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["path", "session", "split", "duration_seconds", "sample_rate", "channels", "bit_depth", "sha256"]
    with manifest_path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    report = prepare(args.input, args.manifest, args.report, args.seed)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["file_count"] else 2


if __name__ == "__main__":
    sys.exit(main())
