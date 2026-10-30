#!/bin/sh
# Runs inside the image, from the project root. All outputs stay in the image
# until build-container.sh copies the artifacts to the host.
set -eu

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo 'A Git checkout is required; use git clone --recursive, not a source ZIP.' >&2
    exit 1
fi
if [ "$(git rev-parse --is-shallow-repository)" != false ]; then
    echo 'Full history is required. Run git fetch --unshallow before building.' >&2
    exit 1
fi
submodule_status=$(git submodule status --recursive)
if ! printf '%s\n' "$submodule_status" | awk '
    /^[-+U]/ { print "Submodule is missing or differs from the recorded revision: " $0 > "/dev/stderr"; bad=1 }
    END { exit bad }
'; then
    echo 'Run git submodule update --init --recursive before building.' >&2
    exit 1
fi

npm run lint
npm run typecheck
npm test
node tools/gen-startup-checksums.js --check

# Discard test-generated products and produce the final production artifacts.
npm run clean
npm run build -- --production
npm run build-service -- --env production
npm run package
npm run manifest

mkdir -p artifacts/container
node tools/container-artifacts.js
