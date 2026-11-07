# Evals

Fixed sources to benchmark the skill against after changes. Each eval re-clones the
same source and scores every kept section with `scripts/diff.mjs` at
1440 / 768 / 390.

| Eval | Source | Expected |
| --- | --- | --- |
| eval-1 | `https://example.com` | 1 section, ≤1% mismatch at all widths; asset count ≥0; build passes |
| eval-2 | a single-page marketing page (HTML files given to the agent locally) | | per-section ≤1%; text verbatim; fonts resolved |
| eval-3 | a blog-style page with mixed-breakpoint layout (768 reflow) | per-section ≤1%; sections detected same count at 1440 and 390 |

## Procedure

1. Start the skill in a scratch directory — it creates the project itself (create-next-app + toolkit scripts).
2. Run the full skill workflow in an agent session on the eval source.
3. Score against the table above using `docs/clone/diff/report.json`, plus a
   checklist: no copied HTML/classes from the source, no placeholder text,
   `npm run build` passes.
4. Record the mismatch numbers in the table below before/after a change; a change
   is accepted only if it does not regress rounds on eval-1 or eval-3.

| Change | eval-1 mean | eval-3 mean | Notes |
| --- | --- | --- | --- |
| baseline | — | — | first recorded run |

Keep eval scratch dirs out of this repo (use /tmp or a sibling folder).
