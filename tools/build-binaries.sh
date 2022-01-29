#!/usr/bin/env bash

# Builds a dropbear sshd/scp binary and rsync to be bundled in homebrew channel package.
#
# Usage, from repository root directory:
#
#   docker run --rm -ti -v /tmp/opt:/opt -v $PWD:/app ubuntu:20.04 /app/tools/build-binaries.sh
#

set -ex

NDK_PATH="${NDK_PATH:-/opt/ndk}"
TARGET_DIR="${TARGET_DIR:-$(dirname $0)/../services/bin}"

apt-get update && apt-get install -y --no-install-recommends wget ca-certificates file make perl

function install_ndk() {
    # Install NDK
    [[ -f "${NDK_PATH}/environment-setup" ]] && return
    wget https://github.com/openlgtv/buildroot-nc4/releases/download/webos-0d62420/arm-webos-linux-gnueabi_sdk-buildroot.1.tar.gz -O /tmp/webos-sdk.tgz
    sha256sum -c <<< '2008d6e5b82ee12907400775b11c974054a756907d4a23404268bfaf95bb261b /tmp/webos-sdk.tgz'
    mkdir -p "$NDK_PATH"
    tar xvf /tmp/webos-sdk.tgz -C "${NDK_PATH}" --strip-components=1
    ${NDK_PATH}/relocate-sdk.sh
    rm /tmp/webos-sdk.tgz
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
   . "${NDK_PATH}/environment-setup"
    cd /opt/dropbear-src
    cat <<EOF >localoptions.h
#define DSS_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_dss_host_key"
#define RSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_rsa_host_key"
#define ECDSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ecdsa_host_key"
#define ED25519_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ed25519_host_key"
#define DEFAULT_PATH "/home/root/.local/bin:/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin:/usr/bin:/bin"
#define DROPBEAR_SFTPSERVER 1
#define SFTPSERVER_PATH "/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin/sftp-server"
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
    . "${NDK_PATH}/environment-setup"
    cd /opt/rsync-src
    ./configure --host arm-webos-linux-gnueabi \
        --disable-simd --disable-debug --with-included-popt=yes --with-included-zlib=yes \
        --disable-lz4 --disable-zstd --disable-xxhash --disable-md2man --disable-acl-support
    make -j$(nproc --all)
    arm-webos-linux-gnueabi-strip rsync
    cp rsync "${TARGET_DIR}"
}

function build_sftp() {
	. "${NDK_PATH}/environment-setup"
	cd /opt/openssh-src
	./configure --host=arm-webos-linux-gnueabi --without-openssl
	make sftp-server -j$(nproc --all)
	arm-webos-linux-gnueabi-strip sftp-server
	cp sftp-server "${TARGET_DIR}"
}

install_ndk &
download 'dropbear' 'https://github.com/mkj/dropbear/archive/refs/tags/DROPBEAR_2020.81.tar.gz' 'c7cfc687088daca392b780f4af87d92ec1803f062c4c984f02062adc41b8147f' &
download 'rsync'    'https://github.com/WayneD/rsync/archive/refs/tags/v3.2.3.tar.gz'           '3127c93d7081db075d1057a44b0bd68ff37f297ba9fe2554043c3e4481ae5056' &
download 'openssh'  'https://ftp.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-8.6p1.tar.gz' 'c3e6e4da1621762c850d03b47eed1e48dff4cc9608ddeb547202a234df8ed7ae' &
wait

build_dropbear &
build_rsync &
build_sftp &
wait
