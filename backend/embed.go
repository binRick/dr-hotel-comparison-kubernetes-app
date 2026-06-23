package main

import _ "embed"

// embeddedSeed is the fallback dataset baked into the binary. At runtime a
// ConfigMap-mounted /data/seed.json takes precedence; this is used only if that
// file is absent (e.g. local `go run` with no mount).
//
//go:embed data/seed.json
var embeddedSeed []byte
