#!/usr/bin/env python3
"""WCAG 2.1 contrast ratio computer for Phase 7c TranscriptView surfaces.

Usage:
    python3 wcag.py
    bun --bun python wcag.py

Pure-stdlib (only `math`); no third-party deps. Reads no files; emits a
contrast table for every NEW visible foreground/background pair Phase 7c
introduces. Mirrors the Phase 5 / M5 `wcag_m5.py` pipeline byte-for-byte
— only the PAIRS list differs.

Pipeline (matches CSS Color L4 sec 10 + WCAG 2.1 sec 1.4.3):
    1. oklch -> oklab
    2. oklab -> linear sRGB (via Bjorn Ottosson's M2 matrix)
    3. linear sRGB -> nonlinear sRGB (piecewise gamma per IEC 61966-2-1)
    4. color-mix(in srgb, A p%, B q%): mix in nonlinear sRGB space, then
       reverse step 3 to get back to linear sRGB.
    5. Relative luminance: linear-sRGB R*0.2126 + G*0.7152 + B*0.0722
    6. Contrast: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.

WCAG AA gates:
    - >= 4.5:1 for normal text (< 18 pt or < 14 pt bold).
    - >= 3.0:1 for SC 1.4.11 non-text UI components.

Phase 7c introduces ZERO new color tokens. Every pair below reuses
M2a-canonical tokens. The script measures every NEW visible
foreground/background pair the Phase 7c surface introduces:

    - Lifecycle card surfaces: sienna inline-start rail (non-text SC 1.4.11)
      against the bare surface backdrop.
    - Group head surfaces: count-badge (mono text on surface-raised), the
      hairline divider, the aggregate-label text on surface.
    - Chip surfaces: chip body text on surface-raised, the severity dots
      (non-text SC 1.4.11), the category tag in ink-muted, the chip-label
      in ink, and the corner Inspect link in accent on bare surface.
    - Aggregate-status indicator dots: success / warn / error / ink-muted
      dots against bare surface (all SC 1.4.11 non-text).

Every pair tested below MUST pass its applicable WCAG bar in BOTH light
and dark modes. Failures are not acceptable — design ships at AA or
better. If a pair fails, the design changes (e.g. swap dot fill to a
higher-contrast token) before any implementation begins.
"""

import math
from typing import Tuple


# ----- M2a-canonical token oklch values (byte-equivalent to wcag_m5.py) -----
TOKENS = {
    "light": {
        "surface":        (0.98, 0.01, 70),
        "surface-raised": (0.96, 0.01, 70),
        "ink":            (0.20, 0.02, 70),
        "ink-muted":      (0.45, 0.02, 70),
        "border":         (0.85, 0.01, 70),
        "border-strong":  (0.65, 0.02, 70),
        "accent":         (0.55, 0.15, 50),
        "success":        (0.48, 0.13, 155),
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
        "success":        (0.64, 0.13, 155),
        "warn":           (0.72, 0.13, 60),
        "error":          (0.68, 0.16, 25),
    },
}


def oklch_to_oklab(L: float, C: float, h_deg: float) -> Tuple[float, float, float]:
    h = math.radians(h_deg)
    return (L, C * math.cos(h), C * math.sin(h))


def oklab_to_linear_srgb(L: float, a: float, b: float) -> Tuple[float, float, float]:
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
    a_srgb = oklch_to_srgb(*a_oklch)
    b_srgb = oklch_to_srgb(*b_oklch)
    mixed_srgb = tuple(a_pct * a_srgb[i] + (1 - a_pct) * b_srgb[i] for i in range(3))
    rgb_lin = tuple(srgb_to_linear(c) for c in mixed_srgb)
    return relative_luminance_from_linear(*rgb_lin)


def contrast(l1: float, l2: float) -> float:
    hi = max(l1, l2)
    lo = min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------------------
# Pair declarations — Phase 7c NEW visible foreground/background pairs.
#
# Each pair: (id, label, foreground spec, background spec, bar)
# `bar` is one of:
#   - "AA text"       — 4.5:1 normal text bar (must pass AA).
#   - "SC 1.4.11"     — 3.0:1 non-text UI component bar.
#
# Phase 7c reuses M4/M5 pairs for ink-on-surface text; this script
# tabulates only the NEW or load-bearing pairs the prototype introduces.
# ---------------------------------------------------------------------------

PAIRS = [
    # Lifecycle card surfaces ------------------------------------------------
    ("P01", "Lifecycle card hairline border (NT)",          "border",         "surface",        "SC 1.4.11"),
    ("P02", "Lifecycle card header divider (NT)",           "border",         "surface",        "SC 1.4.11"),
    ("P03", "Lifecycle sienna inline-start rail (NT)",      "accent",         "surface",        "SC 1.4.11"),
    ("P04", "Lifecycle rail when all-failed (NT)",          "error",          "surface",        "SC 1.4.11"),
    ("P05", "Lifecycle rail when in-flight (NT)",           "ink-muted",      "surface",        "SC 1.4.11"),
    ("P06", "Lifecycle head 'Tool' chrome label",           "ink-muted",      "surface",        "AA text"),
    ("P07", "Lifecycle head tool-name (mono)",              "ink",            "surface",        "AA text"),
    ("P08", "Lifecycle head time/status text",              "ink-muted",      "surface",        "AA text"),
    ("P09", "Lifecycle in-flight pill (Fraunces italic SC)", "ink-muted",     "surface",        "AA text"),
    ("P10", "Lifecycle disclosure summary text",            "ink",            "surface",        "AA text"),
    ("P11", "Lifecycle pre body (mono code)",               "ink",            "surface-raised", "AA text"),
    # Group head surfaces ----------------------------------------------------
    ("P12", "Group head hairline border (NT)",              "border",         "surface",        "SC 1.4.11"),
    ("P13", "Group head divider between name+badge (NT)",   "border",         "surface",        "SC 1.4.11"),
    ("P14", "Group head tool-name (mono)",                  "ink",            "surface",        "AA text"),
    ("P15", "Group head count badge text (mono)",           "ink",            "surface-raised", "AA text"),
    ("P16", "Group head count badge border (NT)",           "border",         "surface-raised", "SC 1.4.11"),
    ("P17", "Group head aggregate-label chrome text",       "ink-muted",      "surface",        "AA text"),
    # Member lifecycle inside expanded group ---------------------------------
    ("P18", "Group-member lifecycle card on raised bg",     "ink",            "surface-raised", "AA text"),
    ("P19", "Group-member rail (sienna over raised bg)",    "accent",         "surface-raised", "SC 1.4.11"),
    # Aggregate-status indicator dots (all SC 1.4.11 non-text) ---------------
    ("P20", "Status dot all-success on surface (NT)",       "success",        "surface",        "SC 1.4.11"),
    ("P21", "Status dot mixed (warn) on surface (NT)",      "warn",           "surface",        "SC 1.4.11"),
    ("P22", "Status dot all-failed (error) on surface (NT)", "error",         "surface",        "SC 1.4.11"),
    ("P23", "Status dot in-flight border (NT, hollow)",     "ink-muted",      "surface",        "SC 1.4.11"),
    # Status dots when nested inside group-member cards on raised bg ---------
    ("P24", "Status dot all-success on raised bg (NT)",     "success",        "surface-raised", "SC 1.4.11"),
    ("P25", "Status dot mixed on raised bg (NT)",           "warn",           "surface-raised", "SC 1.4.11"),
    ("P26", "Status dot all-failed on raised bg (NT)",      "error",          "surface-raised", "SC 1.4.11"),
    ("P27", "Status dot in-flight border on raised bg (NT)", "ink-muted",     "surface-raised", "SC 1.4.11"),
    # Inline warning chip surfaces -------------------------------------------
    ("P28", "Chip background border (NT)",                  "border",         "surface-raised", "SC 1.4.11"),
    ("P29", "Chip-label chrome text",                       "ink",            "surface-raised", "AA text"),
    ("P30", "Chip-reason mono body text",                   "ink-muted",      "surface-raised", "AA text"),
    ("P31", "Chip-tag Fraunces small-caps marginalia",      "ink-muted",      "surface-raised", "AA text"),
    # hide-with-inspect corner affordance ------------------------------------
    ("P32", "Inspect-link accent text on bare surface",     "accent",         "surface",        "AA text"),
    # Banner bucket-strip ----------------------------------------------------
    ("P33", "Banner bucket-strip strong count",             "ink",            "surface-raised", "AA text"),
    ("P34", "Banner bucket-strip muted label",              "ink-muted",      "surface-raised", "AA text"),
    # Orphan stray pill on tool-result panel ---------------------------------
    ("P35", "Stray-result Fraunces SC pill",                "ink-muted",      "surface",        "AA text"),
    # Status-legend caption + items ------------------------------------------
    ("P36", "Status-legend caption muted text",             "ink-muted",      "surface",        "AA text"),
    ("P37", "Status-legend item chrome text",               "ink",            "surface",        "AA text"),
    # Task-lifecycle chapter-marker surfaces (Phase 7c M1 revision) ----------
    # Spec ref: design.md §6.5 + wireframes/12-task-lifecycle.md.
    # Closes the 🎨 deferred to 7c matrix rows codex-event-msg-task-started
    # and codex-event-msg-task-complete. Tokens are byte-equivalent to
    # existing pairs (no new colors), but enumerated here so the script
    # output is the deterministic source of truth for the new surfaces.
    ("P38", "Task-lifecycle hairline pair border (NT)",     "border",         "surface",        "SC 1.4.11"),
    ("P39", "Task-lifecycle Fraunces SC label",             "ink-muted",      "surface",        "AA text"),
    ("P40", "Task-lifecycle middle-dot divider",            "ink-muted",      "surface",        "AA text"),
    ("P41", "Task-lifecycle mono turn id",                  "ink-muted",      "surface",        "AA text"),
]


def luminance_for(spec, mode: str) -> float:
    pal = TOKENS[mode]
    if isinstance(spec, str):
        return relative_luminance_oklch(*pal[spec])
    elif isinstance(spec, tuple) and spec[0] == "mix":
        _, a_name, a_pct, b_name = spec
        return color_mix_srgb(pal[a_name], a_pct, pal[b_name])
    raise ValueError(f"unknown spec: {spec}")


def verdict_for(ratio: float, bar: str) -> str:
    threshold = 4.5 if bar == "AA text" else 3.0
    return "pass" if ratio >= threshold else "FAIL"


def main():
    print()
    print(f"Phase 7c TranscriptView contrast — every NEW pair, light + dark.")
    print(f"AA text bar = 4.5:1 ; SC 1.4.11 non-text bar = 3.0:1.")
    print()
    print(f"{'#':<5} {'Surface':<54} {'FG':<14} {'BG':<16} {'Bar':<11} {'Light':>9} {'Dark':>9} {'L?':<5} {'D?':<5}")
    print("-" * 132)
    light_fail = 0
    dark_fail = 0
    for pair_id, label, fg, bg, bar in PAIRS:
        ratios = []
        verdicts = []
        for mode in ("light", "dark"):
            l_fg = luminance_for(fg, mode)
            l_bg = luminance_for(bg, mode)
            r = contrast(l_fg, l_bg)
            ratios.append(r)
            verdicts.append(verdict_for(r, bar))
        if verdicts[0] == "FAIL":
            light_fail += 1
        if verdicts[1] == "FAIL":
            dark_fail += 1
        bg_repr = bg if isinstance(bg, str) else f"mix({bg[1]} {int(bg[2]*100)}%, {bg[3]})"
        fg_repr = fg if isinstance(fg, str) else str(fg)
        print(
            f"{pair_id:<5} {label:<54} {fg_repr:<14} {bg_repr:<16} {bar:<11} "
            f"{ratios[0]:>7.2f}:1 {ratios[1]:>7.2f}:1 {verdicts[0]:<5} {verdicts[1]:<5}"
        )
    print("-" * 132)
    print(f"Light failures: {light_fail}    Dark failures: {dark_fail}")
    print()
    if light_fail == 0 and dark_fail == 0:
        print("ALL pairs pass their applicable WCAG bar in BOTH light and dark.")
        print("Phase 7c may ship at AA on every new surface.")
    else:
        print("FAILURES PRESENT. Design must adjust before any implementation lands.")


if __name__ == "__main__":
    main()
