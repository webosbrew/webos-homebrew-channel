#!/usr/bin/env sh

# Note: we use inkscape instead of imagemagick due to some weird artifacts
# around text when rendering splashscreen...

set -e

for SIZE in 80 130 160; do
    inkscape assets/icon.svg --export-type=png --export-filename=assets/icon${SIZE}.png -w ${SIZE} -h ${SIZE}
done

inkscape assets/splash.svg --export-type=png --export-filename=assets/splash.png
