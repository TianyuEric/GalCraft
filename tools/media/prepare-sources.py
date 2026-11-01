"""Collect the pinned Windows FFmpeg sources and their original license files.

Run from the repository root with Python 3.11 or newer. The input manifest records
the reviewed target-specific selection. This script does not infer completeness
or replace an unresolved source with another version.
"""

import concurrent.futures
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tomllib
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "tools/media/source-bundle.json"
NOTICE_ROOT = ROOT / "tools/media/notices"
QUIET = "--quiet" in sys.argv


def download(component, output):
    path = output / component["archive"]
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return component["id"], None
    partial = path.with_name(path.name + ".part")
    try:
        request = urllib.request.Request(
            component["download"], headers={"User-Agent": "GalCraft-source-preparation"}
        )
        with urllib.request.urlopen(request, timeout=45) as response, partial.open("wb") as target:
            shutil.copyfileobj(response, target, length=1024 * 1024)
        partial.replace(path)
        if not QUIET:
            print(f"Downloaded {component['id']}: {path.stat().st_size} bytes", flush=True)
        return component["id"], None
    except Exception as error:
        partial.unlink(missing_ok=True)
        print(f"Unavailable {component['id']}: {error}", flush=True)
        return component["id"], str(error)


def inspect(component, output):
    path = output / component["archive"]
    if not path.exists():
        return {"id": component["id"], "status": "unavailable"}
    notices = []
    metadata = []
    special = []
    count = 0

    def visit(name, size, read):
        nonlocal count
        parts = PurePosixPath(name).parts
        if not parts or ".git" in parts:
            return
        count += 1
        basename = parts[-1]
        # Keep upstream notices verbatim, including license directories and
        # third-party notices carried by the pinned source archive.
        is_notice = re.match(r"(?i)^(copying|copyright|licen[cs]e|notice|authors)([0-9._-].*)?$", basename)
        is_notice = is_notice or any(re.match(r"(?i)^licen[cs]es?$", part) for part in parts[:-1])
        is_notice = is_notice or any(PurePosixPath(name).match(pattern) for pattern in component.get("additionalNoticeGlobs", []))
        if is_notice and size <= 4 * 1024 * 1024:
            relative = PurePosixPath(*parts)
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"Invalid source path: {name}")
            target = NOTICE_ROOT / component["id"] / Path(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(read())
            if basename in {"Cargo.toml", ".cargo_vcs_info.json"}:
                metadata.append(name)
            else:
                notices.append(name)
        if basename in {".gitmodules", "Cargo.lock", "DEPS"} or basename.endswith(".wrap"):
            special.append(name)

    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"Invalid ZIP member: {bad}")
            for member in archive.infolist():
                if not member.is_dir():
                    visit(member.filename, member.file_size, lambda m=member: archive.read(m))
    else:
        with tarfile.open(path, "r:*") as archive:
            for member in archive:
                if member.isfile():
                    visit(member.name, member.size, lambda m=member: archive.extractfile(m).read())
            # Consume the remaining compressed stream, including its trailer.
            while archive.fileobj.read(1024 * 1024):
                pass
    result = {
        "id": component["id"], "status": "archive-checked", "archive": component["archive"],
        "bytes": path.stat().st_size, "sourceFileCount": count, "licenseFiles": notices,
        "metadataFiles": metadata, "nestedInputFiles": special,
    }
    if not QUIET:
        print(f"Checked {component['id']}: {count} files, {len(notices)} notices", flush=True)
    return result


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    output = ROOT / manifest["sourceDirectory"]
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "tools/media/source-inputs", output / "build-inputs", dirs_exist_ok=True)
    shutil.copyfile(ROOT / "tools/media/SOURCES.md", output / "README.md")
    if "--check" in sys.argv:
        errors = {}
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            errors = dict(pool.map(lambda component: download(component, output), manifest["components"]))
    inventory = []
    for component in manifest["components"]:
        entry = inspect(component, output)
        if errors.get(component["id"]):
            entry["downloadError"] = errors[component["id"]]
        inventory.append(entry)
    missing = [entry["id"] for entry in inventory if entry["status"] == "unavailable"]
    ids = {component["id"] for component in manifest["components"]}
    for component in manifest["components"]:
        for dependency in component.get("requiredInputs", []):
            if dependency not in ids:
                missing.append(f"{component['id']} required input {dependency}")
        supplements = component.get("supplementalLicenseNotices", {})
        for file in supplements.get("files", []):
            if not (ROOT / "tools/media" / file["path"]).is_file():
                missing.append(f"{component['id']} license {file['path']}")
        canonical = supplements.get("canonicalLicenseText")
        if canonical and not (ROOT / "tools/media" / canonical).is_file():
            missing.append(f"{component['id']} license {canonical}")
    for required in manifest.get("requiredFiles", []):
        if not (output / required).is_file():
            missing.append(required)
    for lock in manifest.get("rustLockFiles", []):
        path = output / lock
        if not path.is_file():
            continue
        for package in tomllib.loads(path.read_text(encoding="utf-8"))["package"]:
            if package.get("source", "").startswith("registry+"):
                dependency = f"crate-{package['name']}-{package['version']}"
                if dependency not in ids:
                    missing.append(f"{lock}: {dependency}")
    (output / "ARCHIVES.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    (output / "SOURCE-INPUTS.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    shutil.copytree(NOTICE_ROOT, output / "NOTICES", dirs_exist_ok=True)
    available = sum(entry["status"] == "archive-checked" for entry in inventory)
    print(f"Checked {available}/{len(inventory)} source archives; missing inputs: {', '.join(missing)}")
    if missing:
        raise SystemExit(1)
    if "--bundle" in sys.argv:
        target = output.parent / manifest["sourceArtifact"]
        partial = target.with_name(target.name + ".part")
        with tarfile.open(partial, "w") as archive:
            archive.add(output, arcname=output.name)
        partial.replace(target)
        print(f"Source artifact: {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
