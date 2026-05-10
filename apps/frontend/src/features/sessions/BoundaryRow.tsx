// Shared chapter-break component (signature detail #1).
//
// Phase 5 / Milestone 5 extracts the boundary recipe out of
// TranscriptView (M4) so both Transcript and Skim consume the same
// component. The exported DOM tree is byte-equivalent to M4's inline
// recipe — same `<li role="separator">`, same three-element grid
// (rule + label + rule), same Fraunces italic small-caps label.
//
// The class names retain `msg msg-boundary` for byte-equivalence with
// M4's existing CSS rhythm rules in TranscriptView.css (the
// `.transcript-stream > .msg-boundary` adjacency selectors stay
// matching) AND add `boundary-row` so SkimView's rhythm rules can
// target the neutral class name.
//
// `staggerIndex`: optional. SkimView passes it (capped at 8 by the
// caller) so the wrapping `<li>` carries `style="animation-delay:
// ${idx*40}ms"`; TranscriptView omits it (Transcript does not stagger).
//
// @see working/phase-5.md:691 (boundary spec)
// @see working/phase-5/designs/m5-skim/design.md §4.2 (extraction plan)

import "./BoundaryRow.css";

export type BoundarySubtype = "session_resumed" | "compacted";

export type BoundaryRowProps = {
  /** When undefined, defaults to "SESSION RESUMED". */
  subtype?: BoundarySubtype;
  /**
   * Optional stagger index. When provided, sets
   * `style.animationDelay = "${idx * 40}ms"` on the `<li>`. Used by
   * SkimView's first-paint stagger; TranscriptView omits this prop.
   */
  staggerIndex?: number;
};

export function BoundaryRow({ subtype, staggerIndex }: BoundaryRowProps) {
  const label =
    subtype === "compacted" ? "CONVERSATION COMPACTED" : "SESSION RESUMED";
  const style =
    staggerIndex !== undefined
      ? { animationDelay: `${staggerIndex * 40}ms` }
      : undefined;
  return (
    <li
      className="msg msg-boundary boundary-row"
      role="separator"
      aria-orientation="horizontal"
      style={style}
    >
      <span
        aria-hidden="true"
        className="msg-boundary-rule msg-boundary-rule-start boundary-row-rule boundary-row-rule-start"
      />
      <span className="msg-boundary-label boundary-row-label">{label}</span>
      <span
        aria-hidden="true"
        className="msg-boundary-rule msg-boundary-rule-end boundary-row-rule boundary-row-rule-end"
      />
    </li>
  );
}
