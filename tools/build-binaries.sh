#!/bin/bash

# Builds a dropbear sshd/scp binary and rsync to be bundled in homebrew channel package.

set -e -x

NDK_PATH="${NDK_PATH:-/opt/ndk}"
TARGET_DIR="${TARGET_DIR:-$(dirname $0)/../services/bin}"

# Install NDK
install_ndk() {
    local tarball='/tmp/webos-sdk.tar.gz'
    rm -rf -- "${NDK_PATH}"
    mkdir -p -- "${NDK_PATH}"
    wget -O "${tarball}" -- "${1}"
    sha256sum -c <<< "${2} ${tarball}"
    tar -x -f "${tarball}" -C "${NDK_PATH}" --strip-components=1
    "${NDK_PATH}/relocate-sdk.sh"
    rm -- "${tarball}"
}

# Download and checksum a tarball
download() {
    local src="/tmp/${1}.tar.gz"
    local srcdir="/opt/${1}-src"
    rm -rf -- "${srcdir}"
    mkdir -p -- "${srcdir}"
    wget -O "${src}" -- "${2}"
    sha256sum -c <<< "${3} ${src}"
    tar -x -f "${src}" -C "${srcdir}" --strip-components=1
    rm -- "${src}"
}

build_dropbear() {
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
    ./configure --host arm-webos-linux-gnueabi --disable-lastlog
    PROGRAMS='dropbear scp'
    make -j"$(nproc --all)" -- PROGRAMS="${PROGRAMS}"
    arm-webos-linux-gnueabi-strip ${PROGRAMS}
    cp -t "${TARGET_DIR}" -- ${PROGRAMS}
}

build_rsync() {
    cd /opt/rsync-src
    ./configure --host arm-webos-linux-gnueabi \
        --disable-simd --disable-debug --with-included-popt=yes --with-included-zlib=yes \
        --disable-lz4 --disable-zstd --disable-xxhash --disable-md2man --disable-acl-support
    make -j"$(nproc --all)"
    arm-webos-linux-gnueabi-strip rsync
    cp -t "${TARGET_DIR}" -- rsync
}

build_sftp() {
	cd /opt/openssh-src
	./configure --host=arm-webos-linux-gnueabi --without-openssl
	make -j"$(nproc --all)" -- sftp-server
	arm-webos-linux-gnueabi-strip sftp-server
	cp -t "${TARGET_DIR}" -- sftp-server
}

[ -d "${TARGET_DIR}" ] || mkdir -p -- "${TARGET_DIR}"

install_ndk 'https://github.com/openlgtv/buildroot-nc4/releases/download/webos-2974f83/arm-webos-linux-gnueabi_sdk-buildroot.tar.gz' 'd7d7454390d366446c15797e1523e63a03e77cdb6391b8858a0e27d243ace34d' &
download 'dropbear' 'https://github.com/mkj/dropbear/archive/refs/tags/DROPBEAR_2022.83.tar.gz' 'e02c5c36eb53bfcd3f417c6e40703a50ec790a1a772269ea156a2ccef14998d2' &
download 'rsync'    'https://github.com/WayneD/rsync/archive/refs/tags/v3.2.7.tar.gz'           '4f2a350baa93dc666078b84bc300767a77789ca12f0dec3cb4b3024971f8ef47' &
download 'openssh'  'https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-9.1p1.tar.gz' '19f85009c7e3e23787f0236fbb1578392ab4d4bf9f8ec5fe6bc1cd7e8bfdd288' &
wait

. "${NDK_PATH}/environment-setup"

build_dropbear &
build_rsync &
build_sftp &
wait
