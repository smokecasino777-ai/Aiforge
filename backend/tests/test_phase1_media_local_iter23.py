"""Local-only media regression: FFmpeg render outputs + STL parse/export invariants."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
import sys

import imageio_ffmpeg
import pytest
import trimesh

if "/app/backend" not in sys.path:
    sys.path.append("/app/backend")

from routes.creative_files import parse_stl, render_video


def _stream_probe_text(video_path: Path) -> str:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    probe = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-i",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    # ffmpeg prints stream metadata to stderr and may return non-zero for probe-only invocation.
    return (probe.stderr or "") + "\n" + (probe.stdout or "")


def _tiny_mp4_bytes(seconds: int = 2) -> bytes:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory(prefix="iter23-media-src-") as d:
        out = Path(d) / "src.mp4"
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x240:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=44100",
            "-t",
            str(seconds),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            "-y",
            str(out),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        assert result.returncode == 0, result.stderr.decode("utf-8", errors="ignore")
        return out.read_bytes()


def test_render_video_duration_rotation_audio_speed_and_mute():
    source = _tiny_mp4_bytes(seconds=2)
    rendered = render_video(source, start=0, end=2, rotation=90, flip=False, speed=2, mute=True)
    assert isinstance(rendered, bytes)
    assert len(rendered) > 1000

    with tempfile.TemporaryDirectory(prefix="iter23-media-out-") as d:
        out = Path(d) / "out.mp4"
        out.write_bytes(rendered)
        # Duration/size from imageio ffmpeg metadata (same code path used by app).
        reader = imageio_ffmpeg.read_frames(str(out), input_params=["-protocol_whitelist", "file,pipe"])
        meta = next(reader)
        reader.close()
        duration = float(meta.get("duration", 0))
        width, height = int(meta.get("size", (0, 0))[0]), int(meta.get("size", (0, 0))[1])

        stream_txt = _stream_probe_text(out)
        audio_count = stream_txt.count(" Audio:")

        # 2s clip at 2x speed -> around 1s output
        assert 0.7 <= duration <= 1.3
        # Rotation 90 swaps dimensions from 320x240 -> ~240x320 (allow scaled parity)
        assert height >= width
        # mute=True strips audio stream
        assert audio_count == 0


def test_small_stl_reparse_keeps_dimensions():
    mesh = trimesh.creation.box(extents=[20.0, 30.0, 40.0])
    raw = mesh.export(file_type="stl")
    parsed = parse_stl(raw)
    dims = list(parsed.extents)
    dims.sort()
    assert pytest.approx(dims[0], rel=0.02) == 20.0
    assert pytest.approx(dims[1], rel=0.02) == 30.0
    assert pytest.approx(dims[2], rel=0.02) == 40.0
