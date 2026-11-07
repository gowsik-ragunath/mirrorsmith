# Run status

The mirrorsmith agent keeps its run record here and updates it as it goes:
source URL, section decisions (kept / dropped / text overrides), status per
workflow phase, and final diff numbers + build status at the end.

Artifacts (`docs/clone/source/` and `docs/clone/diff/`) are gitignored —
measurements and overlays stay local.
