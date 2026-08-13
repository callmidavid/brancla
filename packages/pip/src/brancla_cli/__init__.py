import os
import platform
import stat
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

VERSION = "1.0.2"
RELEASE_BASE_URL = "https://github.com/callmidavid/brancla/releases/download"


def main() -> int:
    binary = ensure_binary()
    completed = subprocess.run([str(binary), *sys.argv[1:]])
    return completed.returncode


def ensure_binary() -> Path:
    cache_dir = Path.home() / ".brancla" / "bin"
    binary_name = "brancla.exe" if platform.system().lower() == "windows" else "brancla"
    binary_path = cache_dir / binary_name

    if binary_path.exists():
        return binary_path

    cache_dir.mkdir(parents=True, exist_ok=True)
    asset_name = release_asset_name()
    version = os.environ.get("BRANCLA_VERSION", VERSION)
    base_url = os.environ.get("BRANCLA_DOWNLOAD_BASE", f"{RELEASE_BASE_URL}/v{version}")
    url = f"{base_url}/{asset_name}"

    try:
        download(url, binary_path)
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Failed to install Brancla CLI binary from {url}: {exc.reason}"
        ) from exc

    if platform.system().lower() != "windows":
        binary_path.chmod(binary_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return binary_path


def release_asset_name() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "darwin":
        os_key = "darwin"
    elif system == "windows":
        os_key = "win32"
    elif system == "linux":
        os_key = "linux"
    else:
        raise SystemExit(f"Unsupported operating system: {system}")

    if machine in ("arm64", "aarch64"):
        arch_key = "arm64"
    elif machine in ("x86_64", "amd64"):
        arch_key = "x64"
    else:
        raise SystemExit(f"Unsupported CPU architecture: {machine}")

    suffix = ".exe" if os_key == "win32" else ""
    return f"brancla-{os_key}-{arch_key}{suffix}"


def download(url: str, destination: Path) -> None:
    temp_path = destination.with_suffix(destination.suffix + ".download")
    with urllib.request.urlopen(url, timeout=30) as response:
        if response.status < 200 or response.status >= 300:
            raise SystemExit(f"Failed to download Brancla CLI: HTTP {response.status}")
        with temp_path.open("wb") as output:
            output.write(response.read())
    temp_path.replace(destination)
