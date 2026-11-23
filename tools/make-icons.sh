#!/bin/sh
# Erzeugt alle App-Icons aus icons/icon.svg (braucht rsvg-convert, z. B. librsvg).
cd "$(dirname "$0")/../icons" || exit 1
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 180 -h 180 icon.svg -o icon-180.png
sed 's|<g id="mark">|<g id="mark" transform="translate(51.2 51.2) scale(0.8)">|' icon.svg > /tmp/pep-maskable.svg
rsvg-convert -w 512 -h 512 /tmp/pep-maskable.svg -o icon-maskable-512.png
echo "Icons erzeugt"
