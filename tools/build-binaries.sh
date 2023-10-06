#!/bin/bash

# Builds dropbear sshd/scp, rsync, and sftp-server binaries to be bundled in Homebrew Channel package.

set -e -x

NDK_PATH="${NDK_PATH:-/opt/ndk}"
BUILD_ROOT="${BUILD_ROOT:-/tmp/dropbear-build}"
SRC_ROOT="${SRC_ROOT:-$(realpath -e -s -- "$(dirname -- "${0}")/..")}"
PATCH_DIR="${PATCH_DIR:-${SRC_ROOT}/tools/patches}"
TARGET_DIR="${TARGET_DIR:-${SRC_ROOT}/services/bin}"
MAKEOPTS="${MAKEOPTS:--j"$(nproc)"}"

# Install NDK
install_ndk() {
    local src='/tmp/webos-sdk.tar.gz'
    rm -r -f -- "${NDK_PATH}"
    mkdir -p -- "${NDK_PATH}"
    wget -O "${src}" -- "${1}"
    sha256sum -c <<< "${2} ${src}"
    tar -x -f "${src}" -C "${NDK_PATH}" --strip-components=1
    rm -- "${src}"
    "${NDK_PATH}/relocate-sdk.sh"
}

# Download and checksum a src
download() {
    local src="/tmp/${1}.tar.gz"
    local srcdir="${BUILD_ROOT}/${1}-src"
    rm -r -f -- "${srcdir}"
    mkdir -p -- "${srcdir}"
    wget -O "${src}" -- "${2}"
    sha256sum -c <<< "${3} ${src}"
    tar -x -f "${src}" -C "${srcdir}" --strip-components=1
    rm -- "${src}"
}

build_dropbear() {
    cd "${BUILD_ROOT}/dropbear-src"
    patch -N -p 1 -i "${PATCH_DIR}/dropbear-2022.83-webos-v1.patch"
    ./configure ${CONFIGURE_FLAGS} --disable-lastlog --enable-dynamic-crypt
    local programs='dropbear scp'
    make ${MAKEOPTS} -- PROGRAMS="${programs}"
    ${STRIP} -- ${programs}
    cp -v -v -t "${TARGET_DIR}" -- ${programs}
}

build_rsync() {
    cd "${BUILD_ROOT}/rsync-src"
    ./configure ${CONFIGURE_FLAGS} \
        --disable-simd --disable-debug --with-included-popt=yes --with-included-zlib=yes \
        --disable-lz4 --disable-zstd --disable-xxhash --disable-md2man --disable-acl-support
    make ${MAKEOPTS}
    ${STRIP} -- rsync
    cp -v -t "${TARGET_DIR}" -- rsync
}

build_sftp() {
	cd "${BUILD_ROOT}/openssh-src"
	./configure ${CONFIGURE_FLAGS} --without-openssl --without-zlib-version-check
	make ${MAKEOPTS} -- sftp-server
	${STRIP} -- sftp-server
	cp -v -t "${TARGET_DIR}" -- sftp-server
}

[ -d "${TARGET_DIR}" ] || mkdir -p -- "${TARGET_DIR}"

install_ndk 'https://github.com/openlgtv/buildroot-nc4/releases/download/webos-2974f83/arm-webos-linux-gnueabi_sdk-buildroot.tar.gz' 'd7d7454390d366446c15797e1523e63a03e77cdb6391b8858a0e27d243ace34d' &
download 'dropbear' 'https://github.com/mkj/dropbear/archive/refs/tags/DROPBEAR_2022.83.tar.gz' 'e02c5c36eb53bfcd3f417c6e40703a50ec790a1a772269ea156a2ccef14998d2' &
download 'rsync'    'https://github.com/WayneD/rsync/archive/refs/tags/v3.2.7.tar.gz'           '4f2a350baa93dc666078b84bc300767a77789ca12f0dec3cb4b3024971f8ef47' &
download 'openssh'  'https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-9.1p1.tar.gz' '19f85009c7e3e23787f0236fbb1578392ab4d4bf9f8ec5fe6bc1cd7e8bfdd288' &
wait

. "${NDK_PATH}/environment-setup"

build_dropbear
build_rsync
build_sftp
