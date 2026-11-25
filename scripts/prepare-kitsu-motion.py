"""Regenerate bundled Kitsu motion assets from the original sheets (Pillow, NumPy)."""
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parents[1] / "src"
WIDTH, HEIGHT = 192, 208


def write_geometry(pose, sheet, columns, count):
    with Image.open(SRC / sheet) as image:
        alpha = np.asarray(image.convert("RGBA"))[:, :, 3]
    cells = []
    for index in range(count):
        x = index % columns * WIDTH
        y = index // columns * HEIGHT
        cells.append(alpha[y:y + HEIGHT, x:x + WIDTH])
    cells = np.stack(cells)
    mask = cells >= 24
    envelope = mask.any(axis=0)
    rows, cols = np.where(envelope)
    areas = np.sort(np.where(mask, cells, 0).sum(axis=(1, 2)) / 255)
    nonempty = areas[areas > 0]
    header = {
        "left": int(cols.min()), "top": int(rows.min()),
        "width": int(cols.max() - cols.min() + 1), "height": int(rows.max() - rows.min() + 1),
        "area": float(nonempty[len(nonempty) // 2]),
        "leftByRow": np.where(envelope.any(axis=1), envelope.argmax(axis=1), WIDTH).tolist(),
        "rightByRow": np.where(envelope.any(axis=1), WIDTH - envelope[:, ::-1].argmax(axis=1), 0).tolist(),
    }
    bits = np.packbits(mask.reshape(count, -1), axis=1, bitorder="little")
    payload = json.dumps(header).encode() + b"\n" + bits.tobytes()
    (SRC / f"kitsu-{pose}-geometry.gz").write_bytes(gzip.compress(payload, mtime=0))


def write_idle_strips():
    output = SRC / "kitsu-idle-hd-strips"
    output.mkdir(exist_ok=True)
    with Image.open(SRC / "kitsu-idle-packed-hd.png") as sheet:
        for first in range(0, 120, 4):
            x, y = first % 12 * 320, first // 12 * 624
            strip = sheet.crop((x, y, x + 4 * 320, y + 624))
            strip.save(output / f"{first // 4:02}.png", compress_level=3)


if __name__ == "__main__":
    write_geometry("idle", "kitsu-idle.webp", 12, 120)
    write_geometry("running", "kitsu-typing.webp", 16, 216)
    write_idle_strips()
