"""Split the existing Kitsu Running HD WebP into lossless four-frame PNGs.

Requires FFmpeg on PATH. Use --check to compare every output pixel with the
original WebP, including alpha and RGB in completely transparent pixels.
"""

import argparse
from pathlib import Path
import struct
import subprocess


SOURCE = Path(__file__).resolve().parents[1] / "src"
CELL_WIDTH, CELL_HEIGHT = 384, 416
COLUMNS, ROWS, FRAME_COUNT = 16, 14, 216
STRIP_FRAMES = 4
STRIP_WIDTH = CELL_WIDTH * STRIP_FRAMES
ATLAS_ROW_BYTES = CELL_WIDTH * COLUMNS * 4
STRIP_ROW_BYTES = STRIP_WIDTH * 4


def ffmpeg(*args, data=None):
    return subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *map(str, args)],
        input=data, stdout=subprocess.PIPE, check=True,
    ).stdout


def rgba(path):
    return ffmpeg("-threads", 1, "-i", path, "-frames:v", 1, "-threads", 1,
                  "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify existing strips without writing")
    check = parser.parse_args().check
    atlas = rgba(SOURCE / "kitsu-typing-hd.webp")
    if len(atlas) != ATLAS_ROW_BYTES * CELL_HEIGHT * ROWS:
        raise ValueError("Unexpected Running HD atlas size")
    output = SOURCE / "kitsu-typing-hd-strips"
    if check:
        expected = {f"{number:02}.png" for number in range(FRAME_COUNT // STRIP_FRAMES)}
        if {path.name for path in output.iterdir()} != expected:
            raise ValueError("Unexpected Running HD strip set")
        first_cell = b"".join(atlas[row:row + CELL_WIDTH * 4]
                              for row in range(0, CELL_HEIGHT * ATLAS_ROW_BYTES, ATLAS_ROW_BYTES))
        if rgba(SOURCE / "kitsu-typing-rest-hd.png") != first_cell:
            raise ValueError("Running HD rest pose differs from frame zero")
    else:
        output.mkdir(exist_ok=True)
    for cell in range(0, FRAME_COUNT, STRIP_FRAMES):
        x = (cell % COLUMNS) * CELL_WIDTH * 4
        y = (cell // COLUMNS) * CELL_HEIGHT
        start = y * ATLAS_ROW_BYTES + x
        strip = b"".join(atlas[offset:offset + STRIP_ROW_BYTES]
                         for offset in range(start, start + CELL_HEIGHT * ATLAS_ROW_BYTES, ATLAS_ROW_BYTES))
        path = output / f"{cell // STRIP_FRAMES:02}.png"
        if not check:
            path.write_bytes(ffmpeg(
                "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", f"{STRIP_WIDTH}x{CELL_HEIGHT}",
                "-i", "pipe:0", "-frames:v", 1, "-threads", 1, "-c:v", "png",
                "-pred", "mixed", "-compression_level", 6, "-f", "image2pipe", "pipe:1", data=strip,
            ))
        elif (struct.unpack(">II", path.read_bytes()[16:24]) != (STRIP_WIDTH, CELL_HEIGHT)
              or rgba(path) != strip):
            raise ValueError(f"RGBA crop mismatch: {path}")
    print(f"{'Verified' if check else 'Wrote'} {FRAME_COUNT // STRIP_FRAMES} strips ({FRAME_COUNT} HD frames)")


if __name__ == "__main__":
    main()
