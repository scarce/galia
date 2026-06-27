#!/usr/bin/env python3
"""Build a Gemini (Nano Banana) image-to-image request body for one figure.

Usage: build_body.py <girl> <theme> <out_body.json>
  girl  : zoe | iris | rose
  theme : a key in themes.json

Assembles a per-girl, per-theme prompt so each figure is UNIQUE — real
likeness (face + hair + skin) and age-appropriate build pulled from the photo,
plus a theme-specific pose — rather than one fixed body with a swapped head.
"""
import base64, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# Per-girl identity. `build` drives height/proportions so the figures aren't
# clones; `name` is printed large on the box (the character IS the child).
GIRLS = {
    "zoe":  {"face": "zoe.png",  "name": "ZOE",  "age": "about 10 years old (5th grade)",
             "build": "a taller, lankier older-kid build with longer limbs",
             "color": "soft blush pink"},
    "iris": {"face": "iris.png", "name": "IRIS", "age": "about 9 years old (4th grade)",
             "build": "an average kid build for her age",
             "color": "warm pastel butter yellow"},
    "rose": {"face": "rose.png", "name": "ROSE", "age": "about 7 years old (2nd grade)",
             "build": "a smaller, petite young-child build with rounder, softer features",
             "color": "soft powder blue"},
}

TEMPLATE = """Create a photorealistic collectible action figure of a real child, sealed in retail blister packaging. Use the attached photo as the reference for her face, hairstyle and hair color, and skin tone — capture HER specific likeness, not a generic doll.

FORMAT:
- The output image must be PERFECTLY SQUARE, 1:1 aspect ratio.
- Flat orthographic straight-on front view (no perspective, no tilt, no angle).
- A single plain, solid {color} background color filling the ENTIRE frame. Absolutely no scene, no table or surface, no floor, no wall, no drop shadow, no reflection, no extra props or clutter outside the packaging.

PACKAGING:
- A minimal premium SQUARE toy box with a clear molded plastic blister bubble.
- Matte {color} cardboard backing (the box backing and the background are the same {color}).
- No barcodes, no logos, no brand marks, and no promotional or "AI" text anywhere.

FIGURE:
- An articulated action figure that genuinely looks like THIS child — match her face, hair, and skin tone from the photo.
- She is {age}, so give the figure {build}; height and proportions should read as her real age.
- Pose: {pose}.
- Wearing {outfit}.
- Friendly, natural expression.

PACKAGING TEXT (clean modern sans-serif, large, crisp, and correctly spelled):
- Across the top, large and bold: {name}
- Directly beneath the name, smaller: {title}
- Small, in the top corner opposite the name: Edition 2026
- Along the bottom: Secret Power: {power}

ACCESSORIES (each in its own small molded blister slot down one side, beside the figure):
1. {acc0}
2. {acc1}
3. {acc2}

Premium collectible toy aesthetic, ultra-detailed product photography, perfect proportions, sharp clean typography, 8k quality."""


def main():
    girl_key, theme_key, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    girl = GIRLS[girl_key]
    with open(os.path.join(HERE, "themes.json")) as f:
        theme = json.load(f)[theme_key]

    # title + power are shared per theme; outfit/pose/accessories vary per girl
    # so siblings don't look identical within a theme.
    v = theme["variants"][girl_key]

    prompt = TEMPLATE.format(
        age=girl["age"], build=girl["build"], color=girl["color"],
        name=girl["name"], title=theme["title"], power=theme["power"],
        pose=v["pose"], outfit=v["outfit"],
        acc0=v["accessories"][0], acc1=v["accessories"][1], acc2=v["accessories"][2],
    )

    with open(os.path.join(HERE, girl["face"]), "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")

    body = {
        "contents": [{"role": "user", "parts": [
            {"inline_data": {"mime_type": "image/png", "data": b64}},
            {"text": prompt},
        ]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "1:1"},
        },
    }
    with open(out_path, "w") as f:
        json.dump(body, f)
    print(f"wrote {out_path} ({girl_key}/{theme_key}, {len(b64)} b64 chars)")


if __name__ == "__main__":
    main()
