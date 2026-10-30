#!/bin/sh
# Build with Docker or rootless Podman. No source bind mount or TV access.
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
engine=${CONTAINER_ENGINE:-}
image=${BUILD_IMAGE:-localhost/webos-homebrew-channel-build:node22}
output="$project_root/artifacts/container"
no_cache=false

usage() {
    echo 'Usage: tools/build-container.sh [--engine docker|podman] [--output DIR] [--no-cache]'
    echo 'Optional environment: NODE_IMAGE (exact tag or digest), BUILD_IMAGE, CONTAINER_ENGINE.'
}
while [ "$#" -gt 0 ]; do
    case "$1" in
        --engine|--output)
            [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
            case "$1" in
                --engine) engine=$2 ;;
                --output) output=$2 ;;
            esac
            shift 2
            ;;
        --no-cache) no_cache=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done

if [ -z "$engine" ]; then
    if command -v docker >/dev/null 2>&1; then
        engine=docker
    elif command -v podman >/dev/null 2>&1; then
        engine=podman
    else
        echo 'Docker or Podman is required on the host.' >&2
        exit 1
    fi
fi
case "$engine" in
    docker|podman) ;;
    *) echo 'Choose --engine docker or --engine podman.' >&2; exit 2 ;;
esac
command -v "$engine" >/dev/null 2>&1 || { echo "$engine is not installed." >&2; exit 1; }

set -- build --target build --tag "$image" --file "$project_root/Dockerfile"
if [ "$no_cache" = true ]; then set -- "$@" --no-cache; fi
if [ -n "${NODE_IMAGE:-}" ]; then set -- "$@" --build-arg "NODE_IMAGE=$NODE_IMAGE"; fi
"$engine" "$@" "$project_root"

# Copy from a stopped container: no privileged run, host UID mapping, or bind
# mount is needed. Files exported by docker cp belong to the invoking host user.
container_id=''
cleanup() {
    if [ -n "$container_id" ]; then "$engine" rm "$container_id" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
container_id=$("$engine" create "$image" /bin/true)
mkdir -p -- "$output"
output=$(CDPATH= cd -- "$output" && pwd)
"$engine" cp "$container_id:/build/artifacts/container/." "$output/"
echo "Build complete: $output"
echo "Verify with: cd '$output' && sha256sum -c SHA256SUMS"
