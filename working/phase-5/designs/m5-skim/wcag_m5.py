#!/usr/bin/env python3
"""WCAG 2.1 contrast ratio computer for M5 SkimView surfaces.

Usage:
    python3 wcag_m5.py
    bun --bun python wcag_m5.py

Pure-stdlib (only `math`); no third-party deps. Reads no files; emits a
table for every pair declared in colors.md.

Pipeline (matches CSS Color L4 sec 10 + WCAG 2.1 sec 1.4.3):
    1. oklch -> oklab
    2. oklab -> linear sRGB (via Bjorn Ottosson's M2 matrix)
    3. linear sRGB -> nonlinear sRGB (piecewise gamma per IEC 61966-2-1)
    4. color-mix(in srgb, A p%, B q%): mix in nonlinear sRGB space, then
       reverse step 3 to get back to linear sRGB.
    5. Relative luminance: linear-sRGB R*0.2126 + G*0.7152 + B*0.0722
    6. Contrast: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.

This matches Chromium's `color-mix(in srgb)` implementation. The script
is byte-equivalent in math + matrices to wcag_m4.py; only the PAIRS list
differs. Rationale: M5 introduces ZERO new tokens, so the token table
must match M4 exactly. Drift between M4 and M5 ratios on shared pairs
(e.g. ink-on-surface) would indicate a math regression, not a design
change. Codex round 1 should re-run this script and diff its output
against M4's for shared pairs.
"""

import math
from typing import Tuple

# ----- M2a-canonical token oklch values (byte-equivalent to wcag_m4.py) -----
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
    # Bjorn Ottosson's matrices: oklab -> LMS' (cube-root applied) -> LMS -> linear sRGB
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
# Foreground/background spec is a string like "ink" or a tuple
# ("mix", "accent", 0.05, "surface").
#
# M5 introduces ZERO new tokens AND ZERO new color recipes. Every pair
# below either:
#   (a) reuses an M4 measurement byte-equivalent (same tokens, same recipe);
#   (b) measures an M5-specific text-on-surface combination (e.g. boundary
#       label on the fully-bare surface, or ink-muted on the user-tinted
#       background mix used by user_turn panels).
#
# Pairs S01..S29 are the M5 surfaces. Where a pair is byte-equivalent to
# an M4 pair, the inline comment names the M4 ID for cross-reference.

PAIRS = [
    # ---------- user_turn block ----------
    ("S01", "user_turn body text",                       "ink",       ("mix", "accent", 0.05, "surface")),  # = M4 T01
    ("S02", "user_turn code-fence body",                 "ink",       "surface-raised"),                    # = M4 T19/T20
    ("S03", "user_turn inline <code>",                   "ink",       "surface-raised"),                    # = M4 T19
    ("S04", "Agent reaction <summary> chrome",           "ink-muted", "surface"),                           # = M4 T05/T22
    ("S05", "Disabled placeholder prose",                "ink-muted", "surface"),                           # = M4 T22
    ("S06", "Disabled placeholder 4px left border (NT)", "border",    "surface"),                           # SC 1.4.11 NT (decorative aid)
    ("S07", "'Expand to raw messages' summary text",     "accent",    "surface"),                           # = M4 T07/T28
    ("S08", "'Expand to raw messages' hover underline",  "accent",    "surface"),                           # text-decoration only
    # ---------- boundary block (signature detail #1) ----------
    ("S09", "Boundary label (Fraunces italic small-caps)", "ink-muted", "surface"),                         # = M4 T09
    ("S10", "Boundary 1px hairline rule (NT, SC 1.4.11)",  "border-strong", "surface"),                     # = M4 T10
    # ---------- agent_only block ----------
    ("S11", "Agent-only summary text",                   "ink-muted", "surface"),                           # = M4 T22
    ("S12", "Agent-only panel hairline border (NT)",     "border",    "surface"),                           # SC 1.4.11 NT decorative
    # ---------- oversized_user_message block ----------
    ("S13", "Oversized header text",                     "ink",       "surface"),                           # = M4 T02
    ("S14", "Oversized warn left border (NT, SC 1.4.11)", "warn",     "surface"),                           # = M4 T12
    ("S15", "Oversized verbatim <pre> body",             "ink",       "surface-raised"),                    # = M4 T06
    # ---------- truncation banner (byte-equivalent to M4) ----------
    ("S16", "Truncation banner copy",                    "ink",       ("mix", "warn", 0.08, "surface")),    # = M4 T11
    ("S17", "Truncation stripe (NT, SC 1.4.11)",         "warn",      "surface"),                           # = M4 T12
    ("S18", "'Open raw' <strong> in banner",             "ink",       ("mix", "warn", 0.08, "surface")),    # = M4 T13
    # ---------- parse-warnings banner (byte-equivalent to M4) ----------
    ("S19", "Parse-warnings <summary>",                  "ink",       "surface-raised"),                    # = M4 T14
    ("S20", "Parse-warnings <li> (mono)",                "ink-muted", "surface-raised"),                    # = M4 T15
    ("S21", "Dismiss button text",                       "ink",       "surface-raised"),                    # = M4 T16
    ("S22", "Dismiss button focus outline (NT)",         "accent",    "surface-raised"),                    # = M4 T17c
    # ---------- state-branch prose (byte-equivalent to M4) ----------
    ("S23", "'Reading session...' loading prose",        "ink-muted", "surface"),                           # = M4 T22
    ("S24", "Error prose",                               "error",     "surface"),                           # = M4 T23
    ("S25", "Retry button text",                         "ink",       "surface"),                           # = M4 T24
    ("S26", "Retry button border (NT)",                  "border-strong", "surface"),                       # = M4 T25
    ("S27", "Empty-stream prose",                        "ink-muted", "surface"),                           # = M4 T26
    ("S28", "no_raw / idle prose",                       "ink-muted", "surface"),                           # = M4 T27
    # ---------- user_turn attribution shadow (defensive)/edge ----------
    ("S29", "user_turn ink-muted on accent-tinted mix",  "ink-muted", ("mix", "accent", 0.05, "surface")),  # = M4 T03 (defensive — used only if disclosed copy lands inside the tinted panel; UNUSED in M5 baseline)
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
    print(f"{'#':<5} {'Surface':<48} {'FG':<14} {'BG':<32} {'Light':>9} {'Dark':>9}")
    print("-" * 122)
    for pair_id, label, fg, bg in PAIRS:
        ratios = []
        for mode in ("light", "dark"):
            l_fg = luminance_for(fg, mode)
            l_bg = luminance_for(bg, mode)
            ratios.append(contrast(l_fg, l_bg))
        bg_repr = bg if isinstance(bg, str) else f"mix({bg[1]} {int(bg[2]*100)}%, {bg[3]})"
        fg_repr = fg if isinstance(fg, str) else str(fg)
        print(f"{pair_id:<5} {label:<48} {fg_repr:<14} {bg_repr:<32} {ratios[0]:>7.2f}:1 {ratios[1]:>7.2f}:1")


if __name__ == "__main__":
    main()
