# Media and artwork provenance

Object storage holds bytes, not ownership. Upload preparation restricts file size and image MIME families, sanitizes storage keys, requires a client SHA-256 and places assets in `PENDING` safety state. Production storage must use owner-scoped signed PUT/GET URLs and content scanning before `APPROVED` delivery.

`serialArtworkCommitment` requires contiguous token IDs beginning at 1 and hashes the exact ordered `(serial,asset hash)` mapping. The Edition artwork commitment pins that mapping; large 500+ sets use the same deterministic rule. Replacing or randomly remapping a serial after commitment is invalid.
