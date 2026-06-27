# Badge designer

Generates the galia/math **mastery badges** (Layer 1 of the reward system) as premium, photorealistic award medallions — the style of the Apple Fitness "Awards" badges and challenge coins (see the Earth-Day coin reference). One image per badge id in `apps/math/badges.json`.

The look: a **metal-framed enamel medallion** with a **glossy gradient center orb** and the badge's symbol rendered in **raised polished-metal line-art** — isolated on white, studio-lit, like a high-end collectible coin.

## Pieces

- `badges.json` — one entry per badge id: `rarity`, `shape`, `motif` (the symbol, drawn as line-art), `orb` (the center gradient colors). Ids match `apps/math/badges.json`.
- `build_body.py <id> <out.json>` — looks up the badge, maps `rarity → frame metal + enamel field`, fills the shape template, and writes the Nano Banana request body (text-to-image, square).
- `generated/<id>.png` — outputs.

## The visual spec (be precise — this is the house style)

Every badge is **one medallion, straight-on (flat, no perspective)**, that **fills the entire square frame edge-to-edge** — centered, as large as possible, its outer edge touching all four sides, **no margin / padding / drop shadow / border** (only the four small corners are plain flat white). This keeps every badge the **same size**. Lighting is a soft studio key from the **upper-left**; finish is **mirror-polished metal + high-gloss enamel**; render is photoreal 3D, ultra-detailed, 8k. **No text or words anywhere** on the badge (a drawn numeral as part of the symbol is fine). No scene, no extra props.

### Shape `coin` (default — the challenge-coin look)
1. **Body** — a thick circular medallion seen straight-on.
2. **Rim/frame** — a raised, beveled ring of the rarity metal, ~⅛ of the radius wide, bright highlight on the upper-left edge, warm reflections lower-right, with a fine engraved double-groove just inside the rim.
3. **Field** — a recessed enamel face in the rarity color, with a smooth **radial gradient** (slightly lighter at center, darker toward the rim) and a fine satin micro-texture.
4. **Center orb** — a glossy filled disc ~45% of the coin width, colored with the badge's `orb` gradient (top color → bottom color), glassy sheen, a small bright reflection near its upper-left.
5. **Symbol** — the badge's `motif`, drawn in **slim, continuous, raised polished-metal line-art** matching the frame, overlaying both the field and the orb, sitting proud in embossed relief and casting soft micro-shadows.

### Shape `hex` (alternative — the Apple "Perfect Month" look)
1. A **pointy-top hexagon** seen straight-on.
2. **Frame** — a stepped, faceted, beveled metallic bezel of the rarity metal with a darker recessed channel; at the bottom it thickens into a short metallic **"coin-stack" base**.
3. **Face** — a convex **high-gloss two-tone gradient** (the `orb` colors, top→bottom) with a broad soft specular sweep across the upper third.
4. **Symbol** — the `motif` **embossed large and centered**, in the same hue as the face but several shades deeper, raised in relief and catching the top light.

### Rarity → metal + field (drives the tier progression)
| Rarity | Frame & line-art metal | Enamel field (coin) |
|---|---|---|
| common | brushed satin **silver** | deep slate-blue |
| rare | polished **steel-blue chrome**, faint sapphire tint | deep sapphire navy |
| epic | polished **violet-gold** (rose-amethyst) | deep royal purple |
| legendary | mirror-polished **18k gold** | midnight navy blue |

Legendary on a coin is the full Earth-Day-coin treatment (gold rim, navy field, cyan→lime orb, gold relief).

## Generate (Nano Banana via the `pay` MCP, ~$0.01/image, text-to-image)

```
python3 build_body.py first-steps /tmp/first-steps.json
```
then POST the body via `mcp__pay__curl` with `body_file` to
`https://generativelanguage.google.gateway-402.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
and copy the returned tempfile into `generated/`. Square is enforced via `generationConfig.imageConfig.aspectRatio = "1:1"`. See the `pay-bodyfile-nanobanana` memory.

## To add / restyle a badge

Add or edit its entry in `badges.json` (a precise `motif` + `orb`; optional `shape`), then run the two steps above. Keep symbols simple and iconic — slim line-art reads far better than detailed scenes at badge size.

## Notes

- Output is on **white** (cleanest for review and for keying to transparency later); the model doesn't do reliable alpha. Cut the background in post if the trophy room needs transparent PNGs.
- Background is pure flat white per the prompt; if a render adds a surface/scene, re-roll (per-call variance).
