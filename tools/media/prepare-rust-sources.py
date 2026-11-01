"""List the locked Rust source archives used by the pinned media recipes.

The rav1e recipe updates cc during its build. Its original build log identifies
the three changed packages; this tool applies that recorded change, without
running a present-day dependency resolution.
"""

import json
from pathlib import Path
import re
import tarfile
import tomllib
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
manifest_path = ROOT / "tools/media/source-bundle.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
output = ROOT / manifest["sourceDirectory"]
inputs = ROOT / "tools/media/source-inputs"
inputs.mkdir(parents=True, exist_ok=True)
components = manifest["components"]
registry = "registry+https://github.com/rust-lang/crates.io-index"

locks = {}
for name in ("rav1e", "librsvg"):
    component = next(item for item in components if item["id"] == name)
    with tarfile.open(output / component["archive"]) as archive:
        entry = next(item for item in archive if item.name.endswith("/Cargo.lock"))
        lock = archive.extractfile(entry).read().decode()
    (inputs / f"{name}-Cargo.lock").write_text(lock, encoding="utf-8")
    locks[name] = lock

updates = [("cc", "1.10.0"), ("find-msvc-tools", "0.1.15"), ("shlex", "2.0.1")]
upstream = {}
for name, version in updates:
    with urllib.request.urlopen(f"https://crates.io/api/v1/crates/{name}/{version}", timeout=30) as response:
        upstream[name] = json.load(response)["version"]
    assert upstream[name]["num"] == version

cc_block = f'''[[package]]
name = "cc"
version = "1.10.0"
source = "{registry}"
checksum = "{upstream['cc']['checksum']}"
dependencies = [
 "find-msvc-tools",
 "jobserver",
 "libc",
 "shlex 2.0.1",
]

'''
lock = locks["rav1e"]
lock, count = re.subn(r'\[\[package\]\]\nname = "cc"\n.*?(?=\[\[package\]\])', cc_block, lock, count=1, flags=re.S)
assert count == 1
# The original bindgen dependency keeps shlex 1.3.0 in the resolved graph.
lock = lock.replace(' "shlex",', ' "shlex 1.3.0",')
for name, version in updates[1:]:
    lock += f'''\n[[package]]
name = "{name}"
version = "{version}"
source = "{registry}"
checksum = "{upstream[name]['checksum']}"
'''
locks["rav1e"] = lock
(inputs / "rav1e-Cargo.resolved.lock").write_text(lock, encoding="utf-8")
(inputs / "rav1e-lock-update.json").write_text(json.dumps({
    "originalSource": "rav1e-Cargo.lock",
    "reconstructedResolvedLock": "rav1e-Cargo.resolved.lock",
    "evidence": "https://github.com/BtbN/FFmpeg-Builds/actions/runs/40871264069/job/123535205173",
    "recordedChange": "cc 1.2.26 -> 1.10.0; added find-msvc-tools 0.1.15 and shlex 2.0.1; shlex 1.3.0 remains for bindgen.",
    "checksumSource": "crates.io version metadata; retained upstream checksums",
    "scope": "Reconstruction from the pinned source lock and the original build log. This file does not claim byte identity with the deleted build-directory Cargo.lock.",
}, indent=2) + "\n", encoding="utf-8")

packages = {}
for name, lock in locks.items():
    for package in tomllib.loads(lock)["package"]:
        if package.get("source") == registry:
            key = package["name"], package["version"]
            packages.setdefault(key, []).append(name)
        elif package.get("source"):
            raise ValueError(f"Unreviewed Rust source: {package}")

previous_crates = {component["id"]: component for component in components if component["role"] == "locked-crate-source"}
components[:] = [component for component in components if component["role"] != "locked-crate-source"]
for (name, version), users in sorted(packages.items()):
    components.append({
        **previous_crates.get(f"crate-{name}-{version}", {}),
        "id": f"crate-{name}-{version}", "role": "locked-crate-source",
        "source": f"https://crates.io/crates/{name}/{version}", "revision": version,
        "download": f"https://static.crates.io/crates/{name}/{name}-{version}.crate",
        "archive": f"archives/crates/{name}-{version}.crate", "lockUsers": users,
        "scope": "Locked source input; includes target-specific, optional and test dependencies. Inclusion does not assert linkage in the Windows executables.",
    })
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Recorded {len(packages)} distinct locked crate source archives.")
