#!/bin/sh

set -euxo pipefail

for mountpoint in "/media/" "/mnt/lg/appstore/"
do
	unset OPTIONS SOURCE TARGET # if findmnt fails, we don't want junk values here
	eval $(findmnt -O +nosuid -fPT $mountpoint)
	OPTIONS="${OPTIONS/nosuid/remount}"
	mount -o $OPTIONS $SOURCE $TARGET
done
