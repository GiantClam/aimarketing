from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / "components" / "image-assistant" / "image-assistant-workspace.tsx"
TOOLS_FILE = ROOT / "lib" / "image-assistant" / "tools.ts"
ROUNDTRIP_REPORT = ROOT / "artifacts" / "image-assistant" / "patch-roundtrip-final" / "report.json"
ARTIFACT_DIR = ROOT / "artifacts" / "image-assistant" / "patch-composite-math"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def roundtrip_int(value: float) -> int:
    return int(round(value))


def get_image_contain_placement(*, source_width: int, source_height: int, target_width: int, target_height: int):
    expect(source_width > 0 and source_height > 0, "source dimensions must be positive")
    expect(target_width > 0 and target_height > 0, "target dimensions must be positive")

    scale = min(target_width / source_width, target_height / source_height)
    scaled_width = source_width * scale
    scaled_height = source_height * scale
    return {
        "scale": scale,
        "offset_x": (target_width - scaled_width) / 2,
        "offset_y": (target_height - scaled_height) / 2,
    }


def compute_uniform_crop(*, base: dict[str, int], generated: dict[str, int], patch_bounds: dict[str, int]):
    placement = get_image_contain_placement(
        source_width=base["width"],
        source_height=base["height"],
        target_width=generated["width"],
        target_height=generated["height"],
    )
    return {
        "crop_x": roundtrip_int(placement["offset_x"] + patch_bounds["x"] * placement["scale"]),
        "crop_y": roundtrip_int(placement["offset_y"] + patch_bounds["y"] * placement["scale"]),
        "crop_width": roundtrip_int(patch_bounds["width"] * placement["scale"]),
        "crop_height": roundtrip_int(patch_bounds["height"] * placement["scale"]),
        "placement": placement,
    }


def compute_contain_draw(*, source: dict[str, int], target: dict[str, int]):
    placement = get_image_contain_placement(
        source_width=source["width"],
        source_height=source["height"],
        target_width=target["width"],
        target_height=target["height"],
    )
    return {
        "offset_x": roundtrip_int(placement["offset_x"]),
        "offset_y": roundtrip_int(placement["offset_y"]),
        "draw_width": roundtrip_int(source["width"] * placement["scale"]),
        "draw_height": roundtrip_int(source["height"] * placement["scale"]),
        "placement": placement,
    }


def compute_cover_draw(*, source: dict[str, int], target: dict[str, int]):
    source_aspect_ratio = source["width"] / source["height"]
    target_aspect_ratio = target["width"] / target["height"]
    scale = max(target["width"] / source["width"], target["height"] / source["height"])
    return {
        "scale": scale,
        "draw_width": roundtrip_int(source["width"] * scale),
        "draw_height": roundtrip_int(source["height"] * scale),
        "source_aspect_ratio": source_aspect_ratio,
        "target_aspect_ratio": target_aspect_ratio,
    }


def compute_legacy_nonuniform_crop(*, base: dict[str, int], generated: dict[str, int], patch_bounds: dict[str, int]):
    width_scale = generated["width"] / base["width"]
    height_scale = generated["height"] / base["height"]
    return {
        "crop_x": roundtrip_int(patch_bounds["x"] * width_scale),
        "crop_y": roundtrip_int(patch_bounds["y"] * height_scale),
        "crop_width": roundtrip_int(patch_bounds["width"] * width_scale),
        "crop_height": roundtrip_int(patch_bounds["height"] * height_scale),
        "width_scale": width_scale,
        "height_scale": height_scale,
    }


def load_roundtrip_reference():
    payload = json.loads(ROUNDTRIP_REPORT.read_text(encoding="utf-8"))
    return {
        "base": payload["original_dims"],
        "patch_bounds": payload["roundtrip_request"]["patchBounds"],
        "selection_bounds": payload["roundtrip_request"]["selectionBounds"],
        "size_preset": payload["roundtrip_request"]["sizePreset"],
    }


def validate_source_guards():
    source = SOURCE_FILE.read_text(encoding="utf-8")
    tools_source = TOOLS_FILE.read_text(encoding="utf-8")
    expect("function getImageContainPlacement" in source, "contain placement helper is missing from workspace")
    expect("function drawImageContain" in source, "contain draw helper is missing from workspace")
    expect("function drawPatchResultToCanvas" in source, "patch result helper is missing from workspace")
    expect("function getNearestSizePresetForDimensions" in source, "original-dimension preset helper is missing from workspace")
    expect("placement.scale" in source, "workspace should use placement.scale for uniform patch mapping")
    expect("canvasAttachment?.previewWidth || canvasAttachment?.width || null" in source, "canvas snapshot edit should derive size preset from original image dimensions")
    expect(
        "getNearestSizePresetForCanvasBounds(canvasAnnotationMetadata?.patchBounds || null)" not in source,
        "canvas snapshot edit should not derive size preset from patch bounds",
    )
    expect(
        'if (input.taskType === "mask_edit" && input.referenceCount > 0)' in tools_source,
        "mask_edit turns should bypass the text planner when references are present",
    )
    expect("patchWidth > patchBounds.width * 3" in source, "full-frame detection should reject near-patch outputs")
    expect("widthScale = patchWidth / baseWidth" not in source, "workspace regressed to width-only scaling")
    expect("heightScale = patchHeight / baseHeight" not in source, "workspace regressed to height-only scaling")
    expect(
        "patchCtx.drawImage(patchImage, 0, 0, patchCanvas.width, patchCanvas.height)" not in source,
        "workspace should not stretch patch results directly into patch bounds",
    )


def main():
    validate_source_guards()

    reference = load_roundtrip_reference()
    expect(reference["size_preset"] == "4:5", f"expected 4:5 roundtrip preset, got {reference['size_preset']}")

    canonical_full_frame_result = {
        "width": 960,
        "height": 1200,
    }
    uniform_crop = compute_uniform_crop(
        base=reference["base"],
        generated=canonical_full_frame_result,
        patch_bounds=reference["patch_bounds"],
    )
    legacy_crop = compute_legacy_nonuniform_crop(
        base=reference["base"],
        generated=canonical_full_frame_result,
        patch_bounds=reference["patch_bounds"],
    )

    expect(
        uniform_crop["crop_x"] == 93 and uniform_crop["crop_y"] == 213,
        f"unexpected equal-scale crop origin: {uniform_crop}",
    )
    expect(
        uniform_crop["crop_width"] == 158 and uniform_crop["crop_height"] == 120,
        f"unexpected equal-scale crop size: {uniform_crop}",
    )
    expect(
        legacy_crop["crop_y"] != uniform_crop["crop_y"] or legacy_crop["crop_height"] != uniform_crop["crop_height"],
        f"legacy nonuniform crop should differ from equal-scale crop: {legacy_crop} vs {uniform_crop}",
    )

    canonical_local_patch_result = {
        "width": 1024,
        "height": 1024,
    }
    local_patch_target = {
        "width": reference["patch_bounds"]["width"],
        "height": reference["patch_bounds"]["height"],
    }
    contain_draw = compute_contain_draw(source=canonical_local_patch_result, target=local_patch_target)
    cover_draw = compute_cover_draw(source=canonical_local_patch_result, target=local_patch_target)
    expect(
        contain_draw["offset_x"] == 24 and contain_draw["offset_y"] == 0,
        f"unexpected contain offsets for local patch result: {contain_draw}",
    )
    expect(
        contain_draw["draw_width"] == 150 and contain_draw["draw_height"] == 150,
        f"unexpected contain draw size for local patch result: {contain_draw}",
    )
    expect(
        cover_draw["draw_height"] > contain_draw["draw_height"],
        f"cover draw should enlarge/crop the local patch result: {cover_draw} vs {contain_draw}",
    )

    report = {
        "source_file": str(SOURCE_FILE.relative_to(ROOT)).replace("\\", "/"),
        "roundtrip_reference": reference,
        "canonical_full_frame_result": canonical_full_frame_result,
        "uniform_crop": uniform_crop,
        "legacy_nonuniform_crop": legacy_crop,
        "canonical_local_patch_result": canonical_local_patch_result,
        "local_patch_contain_draw": contain_draw,
        "local_patch_cover_draw": cover_draw,
        "status": "ok",
    }
    (ARTIFACT_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
