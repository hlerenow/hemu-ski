"""Build versioned 1K GLBs and a mesh-free locomotion GLB; originals stay intact.

Requires Pillow. Run from the repository root: python3 tools/models/mobile-assets.py
Existing output is accepted only when byte-identical; use a new version otherwise.
"""
from pathlib import Path
from io import BytesIO
import copy
import hashlib
import json
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "public/models"
OUT = MODELS / "mobile-v01"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(data):
    magic, version, length = struct.unpack_from("<III", data)
    assert (magic, version, length) == (0x46546C67, 2, len(data))
    chunks = {}
    offset = 12
    while offset < length:
        size, kind = struct.unpack_from("<II", data, offset)
        chunks[kind] = data[offset + 8:offset + 8 + size]
        offset += 8 + size
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]


def view_bytes(doc, binary, index):
    view = doc["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def write_glb(doc, parts):
    binary = bytearray()
    for view, data in zip(doc["bufferViews"], parts):
        binary.extend(b"\0" * (-len(binary) % 4))
        view["byteOffset"] = len(binary)
        view["byteLength"] = len(data)
        binary.extend(data)
    doc["buffers"] = [{"byteLength": len(binary)}]
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    return (struct.pack("<IIIII", 0x46546C67, 2, 28 + len(encoded) + len(binary), len(encoded), 0x4E4F534A)
            + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary)


def save_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f"Refusing to replace existing asset: {path}")
    else:
        path.write_bytes(data)


def mobile_models():
    manifest = {}
    for path in sorted(MODELS.rglob("*.glb")):
        if OUT in path.parents:
            continue
        original = path.read_bytes()
        doc, binary = read_glb(original)
        before = copy.deepcopy(doc)
        assert len(doc["buffers"]) == 1 and "uri" not in doc["buffers"][0]
        parts = [view_bytes(doc, binary, i) for i in range(len(doc["bufferViews"]))]
        changed = []
        for image in doc.get("images", []):
            index = image["bufferView"]
            with Image.open(BytesIO(parts[index])) as img:
                if max(img.size) <= 1024:
                    continue
                old_size = img.size
                img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                out = BytesIO()
                if image["mimeType"] == "image/jpeg":
                    img.convert("RGB").save(out, format="JPEG", quality=95, subsampling=0)
                elif image["mimeType"] == "image/png":
                    img.save(out, format="PNG")
                else:
                    raise ValueError(image["mimeType"])
                parts[index] = out.getvalue()
                changed.append({"view": index, "before": list(old_size), "after": list(img.size)})
        if not changed:
            continue
        output = write_glb(doc, parts)
        verify, new_binary = read_glb(output)
        image_views = {item["view"] for item in changed}
        # All geometry, skin and animation accessors still point at identical bytes.
        assert before["accessors"] == verify["accessors"]
        for i in range(len(parts)):
            if i not in image_views:
                assert view_bytes(before, binary, i) == view_bytes(verify, new_binary, i)
        for key in ("nodes", "meshes", "skins", "animations", "materials", "textures", "images", "scenes"):
            assert before.get(key) == verify.get(key), key
        relative = path.relative_to(MODELS)
        target = OUT / relative.parent / (relative.stem.replace("tex2k", "tex1k") + "-mobile-v01.glb")
        save_new(target, output)
        manifest[relative.as_posix()] = {
            "file": target.relative_to(MODELS).as_posix(),
            "sourceSha256": sha(original), "sha256": sha(output),
            "sourceBytes": len(original), "bytes": len(output), "images": changed,
        }
    save_new(OUT / "manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
    return manifest


def locomotion():
    source = MODELS / "female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb"
    original = source.read_bytes()
    doc, binary = read_glb(original)
    result = {key: copy.deepcopy(doc[key]) for key in ("asset", "scene", "scenes", "nodes", "animations")}
    # Keep the source transform hierarchy and joint declarations: GLTFLoader
    # uses skin.joints to distinguish Bones from ordinary Object3Ds even when
    # the asset contains no mesh. Inverse bind matrices are not needed here.
    result["skins"] = [{key: copy.deepcopy(value) for key, value in skin.items() if key != "inverseBindMatrices"}
                       for skin in doc["skins"]]
    for node in result["nodes"]:
        for key in ("mesh", "skin", "camera", "extensions", "weights"):
            node.pop(key, None)
    accessors = sorted({sampler[key] for animation in result["animations"]
                        for sampler in animation["samplers"] for key in ("input", "output")})
    result["accessors"] = [copy.deepcopy(doc["accessors"][i]) for i in accessors]
    for animation in result["animations"]:
        for sampler in animation["samplers"]:
            for key in ("input", "output"):
                sampler[key] = accessors.index(sampler[key])
    views = sorted({accessor["bufferView"] for accessor in result["accessors"]})
    assert not any("sparse" in accessor for accessor in result["accessors"])
    result["bufferViews"] = [copy.deepcopy(doc["bufferViews"][i]) for i in views]
    for accessor in result["accessors"]:
        accessor["bufferView"] = views.index(accessor["bufferView"])
    output = write_glb(result, [view_bytes(doc, binary, i) for i in views])
    target = MODELS / "motions/rider-locomotion-v02/female-locomotion-v02.glb"
    save_new(target, output)
    info = {"source": source.relative_to(MODELS).as_posix(), "sourceSha256": sha(original),
            "file": target.relative_to(MODELS).as_posix(), "sha256": sha(output), "bytes": len(output)}
    save_new(target.parent / "manifest.json", (json.dumps(info, indent=2) + "\n").encode())
    return info


if __name__ == "__main__":
    manifest = mobile_models()
    print(f"Verified {len(manifest)} mobile GLBs: {sum(x['sourceBytes'] for x in manifest.values()):,} → {sum(x['bytes'] for x in manifest.values()):,} bytes")
    print("Locomotion:", locomotion())
