# Collectible designer

Generates the galia/math collectible figures: a photorealistic **action-figure-in-square-blister-packaging** for each girl, in many themes, using her real face from the reference photo. Each figure should look like *that child* (face + hair + skin + age-appropriate build), not a generic doll with a swapped head.

## Pieces

- `zoe.png`, `iris.png`, `rose.png` — reference photos (face/hair/skin source).
- `themes.json` — one entry per theme: `title`, `outfit`, `power`, `pose`, `accessories[3]`.
- `build_body.py <girl> <theme> <out.json>` — assembles a per-girl + per-theme prompt (identity & build from `GIRLS` in the script, theme content from `themes.json`) and writes the Gemini image-to-image request body with the face base64-embedded.
- `generated/<girl>_<theme>.png` — outputs.

## Design rules (baked into the template)

- **Square 1:1** — enforced via `generationConfig.imageConfig.aspectRatio = "1:1"` (the model ignores "square" in prose; the config is what works).
- **Per-girl packaging color** (background + box backing): Zoe = soft blush **pink**, Iris = warm pastel **yellow**, Rose = soft powder **blue**. Set in `GIRLS[*].color`.
- Plain solid color background, no scene / table / shadow / clutter.
- **No logos, barcodes, or "AI" promo text.**
- Packaging text: **girl's name** large (ZOE / IRIS / ROSE) + theme title + `Edition 2026` (top corner) + `Secret Power:` line.
- **Uniqueness, not clones:** likeness (face/hair/skin) and **age-appropriate build** come from each girl; the **pose** and outfit vary per theme. Each call is stateless, so variety lives entirely in the prompt.

**Known model quirk:** packaging text occasionally has small typos/garbles (e.g. "never gius gup") — Nano Banana's text rendering is imperfect. Re-roll the image or composite text in post if it matters.

## To generate (Nano Banana via the `pay` MCP, ~$0.01/image)

```
python3 build_body.py zoe explorer /tmp/zoe_explorer.json
```
then POST the body via `mcp__pay__curl` with `body_file` to
`https://generativelanguage.google.gateway-402.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
and copy the returned tempfile into `generated/`. See the `pay-bodyfile-nanobanana` memory.

## To add a theme

Add an entry to `themes.json` (give it a distinctive `pose` and 3 themed accessories), then run the two steps above.
