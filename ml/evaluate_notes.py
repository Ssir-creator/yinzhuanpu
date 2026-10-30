"""Evaluate predicted note events against a reference CSV."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def load_notes(path: Path) -> list[dict]:
    notes = []
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        required = {"onset", "offset", "midi"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"{path} must contain onset, offset, midi columns")
        for line, row in enumerate(reader, 2):
            note = {"onset": float(row["onset"]), "offset": float(row["offset"]), "midi": int(row["midi"])}
            if note["onset"] < 0 or note["offset"] <= note["onset"] or not 0 <= note["midi"] <= 127:
                raise ValueError(f"invalid note at {path}:{line}")
            notes.append(note)
    return sorted(notes, key=lambda note: (note["onset"], note["midi"]))


def evaluate(reference: list[dict], prediction: list[dict], onset_tolerance: float = 0.05,
             offset_tolerance: float = 0.05, offset_ratio: float = 0.20) -> dict:
    candidates = []
    for reference_index, expected in enumerate(reference):
        allowed_offset = max(offset_tolerance, (expected["offset"] - expected["onset"]) * offset_ratio)
        for prediction_index, actual in enumerate(prediction):
            onset_error = abs(actual["onset"] - expected["onset"])
            offset_error = abs(actual["offset"] - expected["offset"])
            if actual["midi"] == expected["midi"] and onset_error <= onset_tolerance and offset_error <= allowed_offset:
                candidates.append((onset_error + offset_error, reference_index, prediction_index, onset_error, offset_error))
    used_reference, used_prediction, matches = set(), set(), []
    for _, reference_index, prediction_index, onset_error, offset_error in sorted(candidates):
        if reference_index in used_reference or prediction_index in used_prediction:
            continue
        used_reference.add(reference_index)
        used_prediction.add(prediction_index)
        matches.append((onset_error, offset_error))

    true_positive = len(matches)
    precision = true_positive / len(prediction) if prediction else 0.0
    recall = true_positive / len(reference) if reference else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "reference_notes": len(reference),
        "predicted_notes": len(prediction),
        "true_positive": true_positive,
        "false_positive": len(prediction) - true_positive,
        "false_negative": len(reference) - true_positive,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
        "mean_onset_error_ms": round(sum(item[0] for item in matches) / true_positive * 1000, 3) if matches else None,
        "mean_offset_error_ms": round(sum(item[1] for item in matches) / true_positive * 1000, 3) if matches else None,
        "matching": {
            "onset_tolerance_ms": onset_tolerance * 1000,
            "offset_tolerance_ms": offset_tolerance * 1000,
            "offset_ratio": offset_ratio,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("prediction", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = evaluate(load_notes(args.reference), load_notes(args.prediction))
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
