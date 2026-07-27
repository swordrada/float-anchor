#!/usr/bin/env python3
"""Generate all FloatAnchor application icons from the canonical brand SVG."""

from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "float-anchor-logo.svg"
BUILD_DIR = ROOT / "build"
PNG_PATH = BUILD_DIR / "icon.png"
ICNS_PATH = BUILD_DIR / "icon.icns"
ICO_PATH = BUILD_DIR / "icon.ico"
LEGACY_PNG_PATH = BUILD_DIR / "icon-solid.png"
ICONSET_DIR = BUILD_DIR / "icon.iconset"

ICONSET_SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_64x64.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
    "icon_1024x1024.png": 1024,
}


def run(*args: str) -> None:
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"缺少 {name}，请在 macOS 上运行此脚本")
    return path


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"找不到品牌图标源：{SOURCE}")

    sips = require_tool("sips")
    iconutil = require_tool("iconutil")
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    # SVG → master PNG. sips preserves the transparent squircle corners.
    run(sips, "-s", "format", "png", str(SOURCE), "--out", str(PNG_PATH))

    if ICONSET_DIR.exists():
        shutil.rmtree(ICONSET_DIR)
    ICONSET_DIR.mkdir(parents=True)
    for name, size in ICONSET_SIZES.items():
        run(
            sips,
            "-z",
            str(size),
            str(size),
            str(PNG_PATH),
            "--out",
            str(ICONSET_DIR / name),
        )

    run(iconutil, "-c", "icns", str(ICONSET_DIR), "-o", str(ICNS_PATH))

    # electron-builder consumes icon.png on Windows, while icon.ico remains
    # available for shortcuts and tooling that expects an explicit ICO file.
    with tempfile.TemporaryDirectory() as temp_dir:
        ico_source = Path(temp_dir) / "icon-256.png"
        run(sips, "-z", "256", "256", str(PNG_PATH), "--out", str(ico_source))
        run(sips, "-s", "format", "ico", str(ico_source), "--out", str(ICO_PATH))

    # Keep the ignored legacy preview asset in sync for local packaging scripts.
    shutil.copy2(PNG_PATH, LEGACY_PNG_PATH)

    print(f"Generated {PNG_PATH.relative_to(ROOT)}")
    print(f"Generated {ICNS_PATH.relative_to(ROOT)}")
    print(f"Generated {ICO_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Icon generation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
