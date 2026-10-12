"""Deterministic synthetic plucked strings; standard library only."""
from pathlib import Path
import math
import random
import struct
import wave

RATE, LENGTH = 22050, 6
ROOT = Path(__file__).resolve().parents[1] / 'assets'

def render(technique, learner):
    rng = random.Random(173 + learner)
    samples = [0.0] * (RATE * LENGTH)
    if technique == 'roll':
        times, t = [], .3
        while t < 5.5:
            times.append(t)
            t += .115 + (rng.uniform(-.05, .065) if learner else 0)
        notes = [(t, 293.66, (.26 + rng.uniform(-.14, .14)) if learner else .26, .11) for t in times]
    elif technique == 'slide':
        notes = [(t, 220, .55, .9) for t in [.3, 1.6, 2.9, 4.2]]
    else:
        notes = [(base + i * (.075 if learner else .028), f, .25, .4)
                 for base in [.3, 1.5, 2.7, 3.9, 5.1]
                 for i, f in enumerate([146.83, 220, 293.66, 440])]
    for start, freq, amp, decay in notes:
        phase = 0
        for j in range(min(int(RATE * 1.3), len(samples) - int(start * RATE))):
            t = j / RATE
            progress = min(t / .8, 1)
            if learner:
                progress = round(progress * 5) / 5
            pitch = freq * 2 ** (progress * 5 / 12) if technique == 'slide' else freq
            phase += 2 * math.pi * pitch / RATE
            tone = sum(math.sin(phase * h) / h ** 1.3 for h in range(1, 7))
            noise = rng.uniform(-1, 1) * math.exp(-t * 100) * .12
            samples[int(start * RATE) + j] += amp * min(t / .003, 1) * math.exp(-t / decay) * (tone + noise)
    scale = .75 / max(max(abs(v) for v in samples), 1.2)
    return [max(-32767, min(32767, int(v * scale * 32767))) for v in samples]

if __name__ == '__main__':
    ROOT.mkdir(exist_ok=True)
    for technique in ['roll']:
        for learner in [False, True]:
            path = ROOT / f'{technique}-{"practice" if learner else "reference"}.wav'
            with wave.open(str(path), 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(RATE)
                output.writeframes(struct.pack('<' + 'h' * RATE * LENGTH, *render(technique, learner)))
            print(path.name)
