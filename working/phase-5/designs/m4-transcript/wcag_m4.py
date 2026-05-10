#!/usr/bin/env python3
"""WCAG 2.1 contrast ratio computer for M4 Transcript surfaces.

Usage:
    python3 wcag_m4.py
    bun --bun python wcag_m4.py

Pure-stdlib (only `math`); no third-party deps. Reads no files; emits a
table for every pair declared in colors.md.

Pipeline (matches CSS Color L4 §10 + WCAG 2.1 §1.4.3):
    1. oklch -> oklab
    2. oklab -> linear sRGB (via Björn Ottosson's M2 matrix)
    3. linear sRGB -> nonlinear sRGB (piecewise gamma per IEC 61966-2-1)
    4. color-mix(in srgb, A p%, B q%): mix in nonlinear sRGB space, then
       reverse step 3 to get back to linear sRGB.
    5. Relative luminance: linear-sRGB R*0.2126 + G*0.7152 + B*0.0722
    6. Contrast: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.

This matches Chromium's `color-mix(in srgb)` implementation.
"""

import math
from typing import Tuple

# ----- M2a-canonical token oklch values (per colors.md token reference table) -----
TOKENS = {
    "light": {
        "surface":        (0.98, 0.01, 70),
        "surface-raised": (0.96, 0.01, 70),
        "ink":            (0.20, 0.02, 70),
        "ink-muted":      (0.45, 0.02, 70),
        "border":         (0.85, 0.01, 70),
        "border-strong":  (0.65, 0.02, 70),
        "accent":         (0.55, 0.15, 50),
        "warn":           (0.58, 0.15, 60),
        "error":          (0.52, 0.18, 25),
    },
    "dark": {
        "surface":        (0.15, 0.01, 70),
        "surface-raised": (0.18, 0.01, 70),
        "ink":            (0.92, 0.01, 70),
        "ink-muted":      (0.70, 0.01, 70),
        "border":         (0.28, 0.01, 70),
        "border-strong":  (0.48, 0.02, 70),
        "accent":         (0.65, 0.15, 50),
        "warn":           (0.72, 0.13, 60),
        "error":          (0.68, 0.16, 25),
    },
}


def oklch_to_oklab(L: float, C: float, h_deg: float) -> Tuple[float, float, float]:
    h = math.radians(h_deg)
    return (L, C * math.cos(h), C * math.sin(h))


def oklab_to_linear_srgb(L: float, a: float, b: float) -> Tuple[float, float, float]:
    # Björn Ottosson's matrices: oklab -> LMS' (cube-root applied) -> LMS -> linear sRGB
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b

    l = l_ ** 3
    m = m_ ** 3
    s = s_ ** 3

    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b_ = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return (r, g, b_)


def linear_to_srgb(c: float) -> float:
    # IEC 61966-2-1 piecewise; clamp first.
    c = max(0.0, min(1.0, c))
    if c <= 0.0031308:
        return 12.92 * c
    return 1.055 * (c ** (1 / 2.4)) - 0.055


def srgb_to_linear(c: float) -> float:
    c = max(0.0, min(1.0, c))
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def oklch_to_srgb(L: float, C: float, h: float) -> Tuple[float, float, float]:
    lab = oklch_to_oklab(L, C, h)
    rgb_lin = oklab_to_linear_srgb(*lab)
    return tuple(linear_to_srgb(x) for x in rgb_lin)


def relative_luminance_from_linear(r: float, g: float, b: float) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def relative_luminance_oklch(L: float, C: float, h: float) -> float:
    srgb = oklch_to_srgb(L, C, h)
    rgb_lin = tuple(srgb_to_linear(c) for c in srgb)
    return relative_luminance_from_linear(*rgb_lin)


def color_mix_srgb(
    a_oklch: Tuple[float, float, float],
    a_pct: float,
    b_oklch: Tuple[float, float, float],
) -> float:
    """color-mix(in srgb, A p%, B q%) -> relative luminance of the mix.

    a_pct is fractional (e.g. 0.05 for 5%); b weight is (1 - a_pct).
    """
    a_srgb = oklch_to_srgb(*a_oklch)
    b_srgb = oklch_to_srgb(*b_oklch)
    mixed_srgb = tuple(a_pct * a_srgb[i] + (1 - a_pct) * b_srgb[i] for i in range(3))
    rgb_lin = tuple(srgb_to_linear(c) for c in mixed_srgb)
    return relative_luminance_from_linear(*rgb_lin)


def contrast(l1: float, l2: float) -> float:
    hi = max(l1, l2)
    lo = min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# ----- Pair declarations -----
# Each pair: (id, label, foreground spec, background spec)
# Foreground/background spec is a string like "ink" or a tuple ("mix", "accent", 0.05, "surface").

PAIRS = [
    # User / assistant message panels
    ("T01", "User body text",                         "ink",       ("mix", "accent", 0.05, "surface")),
    ("T02", "Assistant body text",                    "ink",       "surface"),
    ("T03", "User attribution row",                   "ink-muted", ("mix", "accent", 0.05, "surface")),
    ("T04", "Assistant attribution row",              "ink-muted", "surface"),
    # Tool messages
    ("T05", "Tool header",                            "ink-muted", "surface"),
    ("T06", "Tool <pre> body",                        "ink",       "surface-raised"),
    ("T07", "Tool result Expand summary",             "accent",    "surface"),
    ("T29", "Tool panel border (decorative)",         "border",    "surface"),
    # System
    ("T08", "System body + glyph",                    "ink-muted", "surface"),
    # Boundary
    ("T09", "Boundary label",                         "ink-muted", "surface"),
    ("T10", "Boundary 1px hairline (SC 1.4.11)",      "border-strong", "surface"),
    # Truncation banner
    ("T11", "Truncation banner copy",                 "ink",       ("mix", "warn", 0.08, "surface")),
    ("T12", "Truncation stripe (SC 1.4.11)",          "warn",      "surface"),
    ("T13", "Open raw <strong>",                      "ink",       ("mix", "warn", 0.08, "surface")),
    # Parse-warnings banner
    ("T14", "Parse-warnings <summary>",               "ink",       "surface-raised"),
    ("T15", "Parse-warnings list <li>",               "ink-muted", "surface-raised"),
    ("T16", "Dismiss button text",                    "ink",       "surface-raised"),
    ("T17", "Dismiss button border (decorative)",     "border",    "surface-raised"),
    ("T17b", "Dismiss button hover border",           "border-strong", "surface-raised"),
    ("T17c", "Dismiss button focus outline",          "accent",    "surface-raised"),
    # Unknown
    ("T18", "Unknown body",                           "ink-muted", "surface"),
    # Code-fenced segments
    ("T19", "Inline <code>",                          "ink",       "surface-raised"),
    ("T20", "Code block <pre>",                       "ink",       "surface-raised"),
    # State branches
    ("T22", "Loading prose",                          "ink-muted", "surface"),
    ("T23", "Error prose",                            "error",     "surface"),
    ("T24", "Retry button text",                      "ink",       "surface"),
    ("T25", "Retry button border (SC 1.4.11)",        "border-strong", "surface"),
    ("T26", "Empty-stream prose",                     "ink-muted", "surface"),
    ("T27", "no_raw prose",                           "ink-muted", "surface"),
    # Focus-visible outline
    ("T28", "Focus-visible outline",                  "accent",    "surface"),
]


def luminance_for(spec, mode: str) -> float:
    pal = TOKENS[mode]
    if isinstance(spec, str):
        return relative_luminance_oklch(*pal[spec])
    elif isinstance(spec, tuple) and spec[0] == "mix":
        _, a_name, a_pct, b_name = spec
        return color_mix_srgb(pal[a_name], a_pct, pal[b_name])
    raise ValueError(f"unknown spec: {spec}")


def main():
    print(f"{'#':<5} {'Surface':<42} {'FG':<14} {'BG':<32} {'Light':>8} {'Dark':>8}")
    print("-" * 116)
    for pair_id, label, fg, bg in PAIRS:
        ratios = []
        for mode in ("light", "dark"):
            l_fg = luminance_for(fg, mode)
            l_bg = luminance_for(bg, mode)
            ratios.append(contrast(l_fg, l_bg))
        bg_repr = bg if isinstance(bg, str) else f"mix({bg[1]} {int(bg[2]*100)}%, {bg[3]})"
        fg_repr = fg if isinstance(fg, str) else str(fg)
        print(f"{pair_id:<5} {label:<42} {fg_repr:<14} {bg_repr:<32} {ratios[0]:>7.2f}:1 {ratios[1]:>7.2f}:1")


if __name__ == "__main__":
    main()
