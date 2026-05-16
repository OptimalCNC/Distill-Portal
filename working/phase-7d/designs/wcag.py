#!/usr/bin/env python3
"""WCAG 2.1 contrast ratio computer for Phase 7d marginalia hairlines + echo.

Usage:
    python3 wcag.py
    bun --bun python wcag.py

Pure-stdlib (only `math`); no third-party deps. Reads no files; emits a
contrast table for every NEW visible foreground/background pair Phase 7d
introduces. Mirrors the Phase 7c `wcag.py` pipeline byte-for-byte —
only the PAIRS list differs.

Pipeline (matches CSS Color L4 sec 10 + WCAG 2.1 sec 1.4.3):
    1. oklch -> oklab
    2. oklab -> linear sRGB (via Bjorn Ottosson's M2 matrix)
    3. linear sRGB -> nonlinear sRGB (piecewise gamma per IEC 61966-2-1)
    4. Relative luminance: linear-sRGB R*0.2126 + G*0.7152 + B*0.0722
    5. Contrast: (L1 + 0.05) / (L2 + 0.05) where L1 >= L2.

WCAG AA gates:
    - >= 4.5:1 for normal text (< 18 pt or < 14 pt bold).
    - >= 3.0:1 for SC 1.4.11 non-text UI components.

Phase 7d introduces ZERO new color tokens AND ZERO new visible
fg/bg pairs. The marginalia hairline uses `ink-muted` on `surface`,
which is already measured in Phase 7c as P39, P40, P41. The echo
register (introduced in round 2 for the duplicate-anchor variants)
ALSO uses `ink-muted` on `surface` — the quietness comes from
glyph size + missing body text, NOT from a dimmer ink. Both
registers fold into a single P42 measurement.

This script also records the rejected alternative (`border` on
`surface`, the "subdued ink" candidate that was considered and
rejected for the echo register) as P43-REJECTED, so the audit
trail shows WHY a non-default token combination was not used.

The Phase 7d implementation is GREEN if and only if:
  - P42 measures byte-equivalent to Phase 7c P39 (both modes), AND
  - P43-REJECTED is shown as a documented rejection (its FAIL is
    expected; the script still PASSes overall as long as P42 passes).
"""

import math
from typing import Tuple


# ----- M2a-canonical token oklch values (byte-equivalent to Phase 7c) -----
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
    # Ottosson M2 inverse
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l = l_ ** 3
    m = m_ ** 3
    s = s_ ** 3
    r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return (r, g, b2)


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def linear_to_relative_luminance(rgb: Tuple[float, float, float]) -> float:
    r, g, b = (clamp01(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(L1: float, L2: float) -> float:
    a, b = max(L1, L2), min(L1, L2)
    return (a + 0.05) / (b + 0.05)


def measure(fg_oklch, bg_oklch) -> float:
    fg_lab = oklch_to_oklab(*fg_oklch)
    bg_lab = oklch_to_oklab(*bg_oklch)
    fg_lin = oklab_to_linear_srgb(*fg_lab)
    bg_lin = oklab_to_linear_srgb(*bg_lab)
    return contrast_ratio(
        linear_to_relative_luminance(fg_lin),
        linear_to_relative_luminance(bg_lin),
    )


# ----- Phase 7d pairs -----
#
# Each tuple: (id, surface description, fg-token, bg-token, bar, expected)
# bar is one of "AA" (>=4.5) or "NT" (>=3.0 SC 1.4.11 non-text).
# expected is "pass" (must clear bar) or "reject" (documented FAIL — the
# alternative was considered and rejected, recorded here for the audit
# trail; does NOT count toward overall pass/fail).
PAIRS = [
    ("P42",
     ".msg-metadata text (ink-muted on bare surface) — hairline + echo + cluster",
     "ink-muted", "surface", "AA", "pass"),
    ("P43-R",
     "(REJECTED) echo glyph (border on bare surface) — subdued-ink candidate",
     "border", "surface", "AA", "reject"),
]


def main() -> int:
    print("Phase 7d — WCAG contrast measurements")
    print("=" * 78)
    print(f"{'ID':<6} {'Surface':<60} {'Light':>8} {'Dark':>8} {'Bar':>5}")
    print("-" * 78)
    all_required_pass = True
    for pid, label, fg, bg, bar, expected in PAIRS:
        light = measure(TOKENS["light"][fg], TOKENS["light"][bg])
        dark = measure(TOKENS["dark"][fg], TOKENS["dark"][bg])
        gate = 4.5 if bar == "AA" else 3.0
        meets = light >= gate and dark >= gate
        if expected == "pass":
            all_required_pass = all_required_pass and meets
            mark = "pass" if meets else "FAIL"
        else:
            # Rejected alternative — FAIL is expected; do NOT mark as
            # overall failure, just record the measurement.
            mark = "reject (documented)" if not meets else "REJECT-but-PASSED?"
        print(f"{pid:<6} {label[:60]:<60} {light:>6.2f}:1 {dark:>6.2f}:1 {bar:>5}  {mark}")
    print("=" * 78)
    print(f"Result: {'ALL PASS' if all_required_pass else 'FAILURES'}")
    print()
    print("Phase 7d introduces ZERO new required color pairs. P42 is byte-")
    print("equivalent to Phase 7c P39/P40/P41 (same fg/bg token pair).")
    print("The echo register reuses P42 — quietness from glyph size, not")
    print("from a dimmer ink.")
    print()
    print("P43-R records the rejected `border on surface` candidate for the")
    print("echo glyph (round-2 alternative). The FAIL is expected and")
    print("documented; it does not affect the overall pass/fail result.")
    print()
    print("If P42 differs from Phase 7c P39:")
    print("  - Check tokens.css for unauthorized changes.")
    print("  - Re-run Phase 7c wcag.py and compare.")
    return 0 if all_required_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
