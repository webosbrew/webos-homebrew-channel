#!/usr/bin/env bash

# This should build a working dropbear sshd to be bundled in homebrew channel
# package
#
# Usage:
#
#   docker run --rm -v /tmp/opt:/opt -v $(pwd):/app ubuntu:18.04 /app/tools/build-dropbear.sh
#

set -ex

NDK_PATH="${NDK_PATH:-/opt/webos-sdk-x86_64/1.0.g}"
TARGET_DIR="${TARGET_DIR:-$(dirname $0)/../services/bin}"

apt-get update && apt-get install -y --no-install-recommends xz-utils python git make wget ca-certificates file

# Prepare NDK
if [[ ! -f $NDK_PATH/environment-setup-armv7a-neon-webos-linux-gnueabi ]]; then
    wget https://github.com/webosbrew/meta-lg-webos-ndk/releases/download/1.0.g-rev.4/webos-sdk-x86_64-armv7a-neon-toolchain-1.0.g.sh -O /tmp/webos-ndk-installer
    sha256sum -c <(echo 'a7f740239de589ef8019effdc68ffb0168e02c9fc1d428f563305a555eb30976 /tmp/webos-ndk-installer')
    chmod +x /tmp/webos-ndk-installer
    /tmp/webos-ndk-installer -y -d $NDK_PATH
    rm /tmp/webos-ndk-installer
fi

# Download dropbear
rm -rf /opt/dropbear-src
mkdir -p /opt/dropbear-src
wget https://github.com/mkj/dropbear/archive/refs/tags/DROPBEAR_2020.81.tar.gz -O /tmp/dropbear.tar.gz
sha256sum -c <(echo 'c7cfc687088daca392b780f4af87d92ec1803f062c4c984f02062adc41b8147f /tmp/dropbear.tar.gz')
tar xvf /tmp/dropbear.tar.gz -C /opt/dropbear-src --strip-components=1

# Build
. $NDK_PATH/environment-setup-armv7a-neon-webos-linux-gnueabi
cd /opt/dropbear-src
cat <<EOF >localoptions.h
#define DSS_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_dss_host_key"
#define RSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_rsa_host_key"
#define ECDSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ecdsa_host_key"
#define ED25519_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ed25519_host_key"
EOF

autoconf
autoheader
./configure --host arm-webos-linux-gnueabi
make PROGRAMS="dropbear"
arm-webos-linux-gnueabi-strip dropbear
cp dropbear $TARGET_DIR
