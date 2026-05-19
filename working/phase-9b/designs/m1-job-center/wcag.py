#!/usr/bin/env python3
"""WCAG 2.1 contrast ratio computer for Phase 9b Job Center surfaces.

Usage:
    python3 wcag.py
    bun --bun python wcag.py

Pure-stdlib (only `math`); no third-party deps. Reads no files; emits a
contrast table for every NEW visible foreground/background pair Phase 9b
introduces. Mirrors the Phase 7c `wcag.py` pipeline byte-for-byte — only
the PAIRS list differs.

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

Phase 9b introduces ZERO new color tokens. The status pill family reuses
the existing .action-bar-operation-pill recipe (color-mix at 10-12% fill,
35% border, 75% text mix) on the canonical M2a tokens. The pairs below
enumerate every new visible foreground/background pair the Job Center
prototype introduces:

    - Tray surface vs scrim backdrop (NT, SC 1.4.11).
    - Tray hairline border vs surface (NT).
    - Kind-icon glyph vs surface-raised square (text, AA).
    - Kind-icon square border vs tray surface (NT).
    - Status pill text vs pill fill, for each of the 7 variants (text, AA).
    - Status pill border vs tray surface, for each variant (NT).
    - Cancel button text + border, on tray surface (text + NT).
    - Trigger button count chip text + border, on action-bar surface
      (text + NT).
    - Pretty-JSON <pre> body text on surface-raised (text, AA).
    - "No operations." empty-state text on surface (text, AA).
    - Section-label uppercase chrome text on surface (text, AA).

Every pair tested below MUST pass its applicable WCAG bar in BOTH light
and dark modes. Failures are not acceptable — design ships at AA or
better.
"""

import math
from typing import Tuple, Union


# ----- M2a-canonical token oklch values (byte-equivalent to tokens.css) -----
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


# ---- color-mix helpers ----------------------------------------------------

def _srgb_for(spec, pal):
    """Resolve a color spec to an sRGB triple (each channel in [0,1])."""
    if isinstance(spec, str):
        return oklch_to_srgb(*pal[spec])
    if isinstance(spec, tuple) and spec[0] == "mix":
        # ("mix", a_name, a_pct, b_name) — A% of A, (1-A%) of B.
        _, a_name, a_pct, b_name = spec
        a_srgb = oklch_to_srgb(*pal[a_name])
        b_srgb = oklch_to_srgb(*pal[b_name])
        return tuple(a_pct * a_srgb[i] + (1 - a_pct) * b_srgb[i] for i in range(3))
    if isinstance(spec, tuple) and spec[0] == "mix2":
        # ("mix2", a_name, a_pct, b_spec) — A% of A on top of a nested mix.
        _, a_name, a_pct, b_spec = spec
        a_srgb = oklch_to_srgb(*pal[a_name])
        b_srgb = _srgb_for(b_spec, pal)
        return tuple(a_pct * a_srgb[i] + (1 - a_pct) * b_srgb[i] for i in range(3))
    raise ValueError(f"unknown spec: {spec}")


def luminance_for(spec, mode: str) -> float:
    pal = TOKENS[mode]
    srgb = _srgb_for(spec, pal)
    rgb_lin = tuple(srgb_to_linear(c) for c in srgb)
    return relative_luminance_from_linear(*rgb_lin)


def contrast(l1: float, l2: float) -> float:
    hi = max(l1, l2)
    lo = min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------------------
# Pair declarations — Phase 9b NEW visible foreground/background pairs.
#
# Each pair: (id, label, foreground spec, background spec, bar)
# `bar`:
#   - "AA text"     — 4.5:1 normal text bar (must pass AA).
#   - "SC 1.4.11"   — 3.0:1 non-text UI component bar.
#
# Status pill fill recipe (matches ActionBar.css):
#   bg     = color-mix(in srgb, var(--color-X) 10-12%, var(--color-surface))
#   text   = color-mix(in srgb, var(--color-X) 75%, var(--color-text))
#   border = color-mix(in srgb, var(--color-X) 35%, var(--color-surface))
# where X is accent / success / warn / error.
# ---------------------------------------------------------------------------

PAIRS = [
    # Tray frame ---------------------------------------------------------
    ("J01", "Tray hairline border (NT) vs surface",
        "border", "surface", "SC 1.4.11"),
    ("J02", "Tray section divider (NT) vs surface",
        "border", "surface", "SC 1.4.11"),
    ("J03", "Tray header title (chrome bold) on surface",
        "ink", "surface", "AA text"),
    ("J04", "Section-label uppercase chrome on surface",
        "ink-muted", "surface", "AA text"),
    ("J05", "Section-count mono chrome on surface",
        "ink-muted", "surface", "AA text"),
    ("J06", "Empty-state italic 'No operations.' on surface",
        "ink-muted", "surface", "AA text"),
    ("J07", "Close-button text (chrome) on surface",
        "ink-muted", "surface", "AA text"),

    # Kind-icon glyph ----------------------------------------------------
    ("J08", "Kind-icon glyph (mono I/R) on surface-raised",
        "ink", "surface-raised", "AA text"),
    ("J09", "Kind-icon square hairline (NT) on tray surface",
        "border", "surface", "SC 1.4.11"),

    # Kind label + relative time -----------------------------------------
    ("J10", "Kind label (chrome 600) on surface",
        "ink", "surface", "AA text"),
    ("J11", "Relative time (mono xs) on surface",
        "ink-muted", "surface", "AA text"),

    # Cancel button ------------------------------------------------------
    ("J12", "Cancel button text (error 75% / text) on surface",
        ("mix", "error", 0.75, "ink"), "surface", "AA text"),
    ("J13", "Cancel button border (error 35% / border-strong) on surface (NT)",
        ("mix", "error", 0.35, "border-strong"), "surface", "SC 1.4.11"),
    ("J14", "Cancel button on hover-fill (error 8% / surface) text",
        ("mix", "error", 0.75, "ink"),
        ("mix", "error", 0.08, "surface"), "AA text"),

    # Result-summary line on card surface --------------------------------
    ("J15", "Result-summary 'success' tint text on surface",
        ("mix", "success", 0.75, "ink"), "surface", "AA text"),
    ("J16", "Result-summary 'error' tint text on surface",
        ("mix", "error", 0.75, "ink"), "surface", "AA text"),
    ("J17", "Result-summary muted (cancel/interrupt) text on surface",
        "ink-muted", "surface", "AA text"),

    # Status pill — queued (neutral, dotted border) ----------------------
    ("J18", "Pill 'queued' text (ink-muted) on surface (fill = surface)",
        "ink-muted", "surface", "AA text"),
    ("J19", "Pill 'queued' dotted border (border-strong) on surface (NT)",
        "border-strong", "surface", "SC 1.4.11"),

    # Status pill — running (accent fill, pulsing dot) -------------------
    ("J20", "Pill 'running' text (accent 75% / ink) on accent-10% fill",
        ("mix", "accent", 0.75, "ink"),
        ("mix", "accent", 0.10, "surface"), "AA text"),
    ("J21", "Pill 'running' border (accent 35% / border-strong) on tray surface (NT)",
        ("mix", "accent", 0.35, "border-strong"), "surface", "SC 1.4.11"),
    ("J22", "Pill 'running' dot (text fg) on accent-10% fill (NT)",
        ("mix", "accent", 0.75, "ink"),
        ("mix", "accent", 0.10, "surface"), "SC 1.4.11"),

    # Status pill — cancel_requested (warn fill, dashed border) ----------
    ("J23", "Pill 'cancel_requested' text (warn 75% / ink) on warn-12% fill",
        ("mix", "warn", 0.75, "ink"),
        ("mix", "warn", 0.12, "surface"), "AA text"),
    ("J24", "Pill 'cancel_requested' dashed border (warn 55% / border-strong) (NT)",
        ("mix", "warn", 0.55, "border-strong"), "surface", "SC 1.4.11"),

    # Status pill — succeeded (success fill) -----------------------------
    ("J25", "Pill 'succeeded' text (success 75% / ink) on success-12% fill",
        ("mix", "success", 0.75, "ink"),
        ("mix", "success", 0.12, "surface"), "AA text"),
    ("J26", "Pill 'succeeded' border (success 35% / border-strong) on tray (NT)",
        ("mix", "success", 0.35, "border-strong"), "surface", "SC 1.4.11"),

    # Status pill — failed (error fill) ----------------------------------
    ("J27", "Pill 'failed' text (error 75% / ink) on error-12% fill",
        ("mix", "error", 0.75, "ink"),
        ("mix", "error", 0.12, "surface"), "AA text"),
    ("J28", "Pill 'failed' border (error 35% / border-strong) on tray (NT)",
        ("mix", "error", 0.35, "border-strong"), "surface", "SC 1.4.11"),

    # Status pill — cancelled (muted, solid border, square dot) ----------
    ("J29", "Pill 'cancelled' text (ink-muted) on surface-raised",
        "ink-muted", "surface-raised", "AA text"),
    ("J30", "Pill 'cancelled' border (border-strong) on tray surface (NT)",
        "border-strong", "surface", "SC 1.4.11"),

    # Status pill — interrupted (muted, dashed border, hollow square dot)-
    ("J31", "Pill 'interrupted' text (ink-muted) on surface",
        "ink-muted", "surface", "AA text"),
    ("J32", "Pill 'interrupted' dashed border (border-strong) on surface (NT)",
        "border-strong", "surface", "SC 1.4.11"),

    # Expanded pretty-JSON pre on surface-raised -------------------------
    ("J33", "Expanded <pre> mono body (ink) on surface-raised",
        "ink", "surface-raised", "AA text"),
    ("J34", "Expanded <pre> hairline (border) on surface-raised (NT)",
        "border", "surface-raised", "SC 1.4.11"),
    ("J35", "Expanded meta dt/dd (ink-muted) on surface-raised",
        "ink-muted", "surface-raised", "AA text"),

    # Trigger button (ActionBar) ----------------------------------------
    ("J36", "Trigger button label (ink) on surface",
        "ink", "surface", "AA text"),
    ("J37", "Trigger button border (border-strong) on surface (NT)",
        "border-strong", "surface", "SC 1.4.11"),
    ("J38", "Trigger count chip text (accent 75% / ink) on accent-10% fill",
        ("mix", "accent", 0.75, "ink"),
        ("mix", "accent", 0.10, "surface"), "AA text"),
    ("J39", "Trigger count chip border (accent 35% / border-strong) on action bar (NT)",
        ("mix", "accent", 0.35, "border-strong"), "surface", "SC 1.4.11"),
]


def verdict_for(ratio: float, bar: str) -> str:
    threshold = 4.5 if bar == "AA text" else 3.0
    return "pass" if ratio >= threshold else "FAIL"


def aaa_for(ratio: float, bar: str) -> str:
    if bar == "AA text":
        return "pass" if ratio >= 7.0 else "—"
    # Non-text: WCAG 2.1 has no AAA bar; report dash.
    return "—"


def _spec_repr(spec) -> str:
    if isinstance(spec, str):
        return spec
    if isinstance(spec, tuple) and spec[0] == "mix":
        return f"mix({spec[1]} {int(spec[2]*100)}%, {spec[3]})"
    return str(spec)


def main() -> int:
    print()
    print("Phase 9b Job Center contrast — every NEW pair, light + dark.")
    print("AA text bar = 4.5:1 ; SC 1.4.11 non-text bar = 3.0:1.")
    print("AAA text bar = 7.0:1 (reported as pass/— where applicable).")
    print()
    header = (
        f"{'#':<5} {'Surface':<60} "
        f"{'Bar':<11} {'Light':>9} {'Dark':>9} "
        f"{'L?':<6} {'D?':<6} {'L-AAA':<6} {'D-AAA':<6}"
    )
    print(header)
    print("-" * len(header))
    light_fail = 0
    dark_fail = 0
    table_rows = []
    for pair_id, label, fg, bg, bar in PAIRS:
        ratios = []
        verdicts = []
        aaa_verdicts = []
        for mode in ("light", "dark"):
            l_fg = luminance_for(fg, mode)
            l_bg = luminance_for(bg, mode)
            r = contrast(l_fg, l_bg)
            ratios.append(r)
            verdicts.append(verdict_for(r, bar))
            aaa_verdicts.append(aaa_for(r, bar))
        if verdicts[0] == "FAIL":
            light_fail += 1
        if verdicts[1] == "FAIL":
            dark_fail += 1
        print(
            f"{pair_id:<5} {label:<60} "
            f"{bar:<11} {ratios[0]:>7.2f}:1 {ratios[1]:>7.2f}:1 "
            f"{verdicts[0]:<6} {verdicts[1]:<6} "
            f"{aaa_verdicts[0]:<6} {aaa_verdicts[1]:<6}"
        )
        table_rows.append(
            (pair_id, label, bar, ratios[0], ratios[1], verdicts[0], verdicts[1])
        )
    print("-" * len(header))
    print(f"Light failures: {light_fail}    Dark failures: {dark_fail}")
    print()
    if light_fail == 0 and dark_fail == 0:
        print("ALL pairs pass their applicable WCAG bar in BOTH light and dark.")
        print("Phase 9b Job Center may ship at AA on every new surface.")
        rc = 0
    else:
        print("FAILURES PRESENT. Design must adjust before any implementation lands.")
        rc = 1

    # Emit a markdown table to stdout as well (script consumers can pipe).
    print()
    print("### Markdown table (paste into design.md §WCAG or wireframes/wcag-output.txt)")
    print()
    print("| # | Surface | Bar | Light | Dark | L-AA | D-AA |")
    print("|---|---------|-----|------:|-----:|:----:|:----:|")
    for pid, label, bar, l_r, d_r, l_v, d_v in table_rows:
        print(
            f"| {pid} | {label} | {bar} | {l_r:.2f}:1 | {d_r:.2f}:1 | "
            f"{l_v} | {d_v} |"
        )
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
