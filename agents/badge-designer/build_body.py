#!/usr/bin/env python3
"""Build a Gemini (Nano Banana) text-to-image request body for one badge.

Usage: build_body.py <badge-id> <out_body.json>
  badge-id : a key in badges.json (matches apps/math/badges.json)

Produces a premium award-medallion in the galia/math house style (see SKILL.md):
metal-framed enamel coin, glossy gradient center orb, raised metal line-art
symbol, isolated on white. Pure text-to-image (no reference photo).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# rarity -> frame/line-art metal + enamel field color (the tier progression)
RARITY = {
    "common":    {"metal": "brushed satin silver",
                  "field": "deep slate-blue"},
    "rare":      {"metal": "polished steel-blue chrome with a faint sapphire tint",
                  "field": "deep sapphire navy"},
    "epic":      {"metal": "polished violet-gold (rose-amethyst) metal",
                  "field": "deep royal purple"},
    "legendary": {"metal": "mirror-polished 18k gold",
                  "field": "midnight navy blue"},
}

COMMON_HEAD = (
    "A premium collectible achievement medallion, photorealistic 3D product "
    "render. Soft studio key light from the upper-left, crisp specular "
    "highlights, mirror-polished metal and high-gloss enamel, ultra-detailed, "
    "8k. No text or words anywhere on the badge, no scene, no extra props.\n\n"
    "FRAMING (important):\n"
    "- The badge FILLS the entire square frame edge-to-edge: it is perfectly "
    "centered and as large as possible, with its outer edge touching all four "
    "sides of the image. NO margin, NO padding, NO drop shadow, NO empty border "
    "around it. Only the four small corners outside the badge are plain flat "
    "white. The badge is the same size in every render.\n\n"
)

COIN = COMMON_HEAD + (
    "SHAPE & FRAME:\n"
    "- A thick circular challenge-coin medallion seen perfectly straight-on (flat, no perspective, no tilt), sized so its circular rim touches all four edges of the square image.\n"
    "- Outer rim: a raised, beveled ring of {metal}, about one-eighth of the radius wide, with a bright highlight along the upper-left edge, warm reflections lower-right, and a fine engraved double-groove just inside the rim.\n\n"
    "FACE:\n"
    "- A recessed enamel field of {field}, with a smooth radial gradient (a touch lighter at the center, darkening toward the rim) and a fine satin micro-texture.\n\n"
    "CENTER EMBLEM:\n"
    "- A glossy gradient orb (a smooth filled disc) sits in the middle, about 45% of the coin's width, colored {orb}, with a glassy sheen and a small bright reflection near its upper-left.\n"
    "- Overlaying both the field and the orb is the badge symbol, drawn in slim, continuous, raised polished line-art matching the frame metal: {motif}. The lines are thin and elegant, sit proud of the surface in embossed relief, and cast soft micro-shadows.\n"
)

HEX = COMMON_HEAD + (
    "SHAPE & FRAME:\n"
    "- A pointy-top hexagon badge seen perfectly straight-on, sized so its top and bottom points touch the top and bottom edges of the square image.\n"
    "- A stepped, faceted, beveled metallic bezel of {metal} wraps the hexagon, with a darker recessed channel; at the bottom edge the frame thickens into a short metallic 'coin-stack' base.\n\n"
    "FACE:\n"
    "- A convex, high-gloss two-tone gradient fills the hexagon, {orb}, with a broad soft specular sweep across the upper third.\n\n"
    "EMBLEM:\n"
    "- Centered and large, the badge symbol embossed in the same hue as the face but several shades deeper, raised in relief and catching the top light: {motif}.\n"
)

SHAPES = {"coin": COIN, "hex": HEX}


def main():
    badge_id, out_path = sys.argv[1], sys.argv[2]
    with open(os.path.join(HERE, "badges.json")) as f:
        data = json.load(f)
    b = data[badge_id]
    r = RARITY[b["rarity"]]
    template = SHAPES[b.get("shape", "coin")]

    prompt = template.format(metal=r["metal"], field=r["field"],
                             orb=b["orb"], motif=b["motif"])

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "1:1"},
        },
    }
    with open(out_path, "w") as f:
        json.dump(body, f)
    print(f"wrote {out_path} ({badge_id}, {b['rarity']}/{b.get('shape', 'coin')})")


if __name__ == "__main__":
    main()
