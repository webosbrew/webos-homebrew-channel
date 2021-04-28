#!/usr/bin/env bash

# Builds a dropbear sshd/scp binary and rsync to be bundled in homebrew channel package.
#
# Usage, from repository root directory:
#
#   docker run --rm -ti -v /tmp/opt:/opt -v $PWD:/app ubuntu:18.04 /app/tools/build-binaries.sh
#

set -ex

NDK_PATH="${NDK_PATH:-/opt/webos-sdk-x86_64/1.0.g}"
TARGET_DIR="${TARGET_DIR:-$(dirname $0)/../services/bin}"

apt-get update && apt-get install -y --no-install-recommends xz-utils python git make wget ca-certificates file

function install_ndk() {
    # Install NDK
    [[ -f "${NDK_PATH}/environment-setup-armv7a-neon-webos-linux-gnueabi" ]] && return
    wget https://github.com/webosbrew/meta-lg-webos-ndk/releases/download/1.0.g-rev.4/webos-sdk-x86_64-armv7a-neon-toolchain-1.0.g.sh -O /tmp/webos-ndk-installer
    sha256sum -c <<< 'a7f740239de589ef8019effdc68ffb0168e02c9fc1d428f563305a555eb30976 /tmp/webos-ndk-installer'
    chmod +x /tmp/webos-ndk-installer
    /tmp/webos-ndk-installer -y -d "${NDK_PATH}"
    rm /tmp/webos-ndk-installer
}

function download() {
    # Download and checksum a tarball
    local src="/tmp/$1.tar.gz"
    local srcdir="/opt/$1-src"
    rm -rf "$srcdir"
    mkdir -p "$srcdir"
    wget "$2" -O "$src"
    printf "$3 $src" | sha256sum -c
    tar xvf "$src" -C "$srcdir" --strip-components=1
}

function build_dropbear() {
   . "${NDK_PATH}/environment-setup-armv7a-neon-webos-linux-gnueabi"
    cd /opt/dropbear-src
    cat <<EOF >localoptions.h
#define DSS_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_dss_host_key"
#define RSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_rsa_host_key"
#define ECDSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ecdsa_host_key"
#define ED25519_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ed25519_host_key"
#define DEFAULT_PATH "/home/root/.local/bin:/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin:/usr/bin:/bin"
EOF
    autoconf
    autoheader
    ./configure --host arm-webos-linux-gnueabi --disable-lastlog
    PROGRAMS="dropbear scp"
    make PROGRAMS="${PROGRAMS}" -j$(nproc --all)
    arm-webos-linux-gnueabi-strip ${PROGRAMS}
    cp ${PROGRAMS} "${TARGET_DIR}"
}

function build_rsync() {
    . "${NDK_PATH}/environment-setup-armv7a-neon-webos-linux-gnueabi"
    cd /opt/rsync-src
    ./configure --host arm-webos-linux-gnueabi \
        --disable-simd --disable-debug --with-included-popt=yes --with-included-zlib=yes \
        --disable-lz4 --disable-zstd --disable-xxhash --disable-md2man --disable-acl-support
    make -j$(nproc --all)
    arm-webos-linux-gnueabi-strip rsync
    cp rsync "${TARGET_DIR}"
}

install_ndk &
download 'dropbear' 'https://github.com/mkj/dropbear/archive/refs/tags/DROPBEAR_2020.81.tar.gz' 'c7cfc687088daca392b780f4af87d92ec1803f062c4c984f02062adc41b8147f' &
download 'rsync'    'https://github.com/WayneD/rsync/archive/refs/tags/v3.2.3.tar.gz'           '3127c93d7081db075d1057a44b0bd68ff37f297ba9fe2554043c3e4481ae5056' &
wait

build_dropbear &
build_rsync &
wait
