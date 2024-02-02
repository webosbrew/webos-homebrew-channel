#!/bin/bash

# This script does some early-boot initialization of rooted webOS devices. It's
# meant to be copied over to suitable path (eg. start-devmode.sh) to keep it
# safe from accidental homebrew channel app removal.

# Ensure that startup script runs only once per boot
once=/tmp/webosbrew_startup
exec 200>"${once}.lock"

if ! flock -x -n 200; then
    echo "[!] Startup script already running" >&2
    exit 1
fi

trap "rm -f ${once}.lock" EXIT

if test -f "${once}"; then
    echo "[!] Startup script finished already" >&2
    exit 2
fi

touch "${once}"

# Use default directory if SERVICE_DIR is not provided.
SERVICE_DIR="${SERVICE_DIR-/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service}"

if [[ -e /var/luna/preferences/webosbrew_failsafe ]]; then
    # In case a reboot occured during last startup - open an emergency telnet
    # server and nag user to actually fix this. (since further reboots could
    # lead to devmode removal, etc...)

    telnetd -l /bin/sh
    sleep 1

    luna-send -a webosbrew -f -n 1 luna://com.webos.notification/createToast '{"sourceId":"webosbrew","message": "<b>Failsafe mode!</b><br/>A crash has occured during startup. Fix any causes and reboot."}'
    sleep 15;
    rm -rf /var/luna/preferences/webosbrew_failsafe
    sync -f /var/luna/preferences
    luna-send -a com.webos.service.secondscreen.gateway -f -n 1 luna://com.webos.notification/createAlert '{"sourceId":"webosbrew","message":"<b>Homebrew Channel</b> - Failsafe mode<br />A crash has occured during previous startup - root-related system customizations have been temporarily disabled.<br /><br /> System should go back to normal after a reboot.<br />Would you like to reboot now?","buttons":[{"label":"Reboot now","onclick":"luna://com.webos.service.sleep/shutdown/machineReboot","params":{"reason":"remoteKey"}},{"label":"Reboot later"}]}'
else
    # Set a failsafe flag and sync filesystem to make sure it actually gets
    # tripped...
    touch /var/luna/preferences/webosbrew_failsafe
    sync -f /var/luna/preferences/webosbrew_failsafe
    sleep 2

    # Close fds to avoid leaking Luna socket
    fds="$(ls -1 "/proc/$$/fd")"
    for fd in $fds; do
        case $fd in
        # Don't close stdin, stdout, stderr, or lock
        0|1|2|200) ;;
        *) eval "exec $fd>&-" ;;
        esac
    done

    # Reset devmode reboot counter
    rm -f /var/luna/preferences/dc*

    # Block software update servers
    if [[ -e /var/luna/preferences/webosbrew_block_updates ]]; then
        cp /etc/hosts /tmp/hosts
        mount --bind /tmp/hosts /etc/hosts

        echo '' >> /etc/hosts
        echo '# This file is dynamically regenerated on boot by webosbrew startup script' >> /etc/hosts
        echo '127.0.0.1 snu.lge.com su-dev.lge.com su.lge.com su-ssl.lge.com' >> /etc/hosts
        echo '::1 snu.lge.com su-dev.lge.com su.lge.com su-ssl.lge.com' >> /etc/hosts
    fi

    # Start root telnet server
    if [[ ! -e /var/luna/preferences/webosbrew_telnet_disabled ]]; then
        telnetd -l /bin/sh 200>&-
    fi

    # Start sshd
    if [[ -e /var/luna/preferences/webosbrew_sshd_enabled ]]; then
        mkdir -p /var/lib/webosbrew/sshd
        "${SERVICE_DIR}/bin/dropbear" -R 200>&-
    fi

    printf "\033[1;91mNEVER EVER OVERWRITE SYSTEM PARTITIONS LIKE KERNEL, ROOTFS, TVSERVICE.\nYour TV will be bricked, guaranteed! See https://rootmy.tv/warning for more info.\033[0m\n" > /tmp/motd
    mount --bind /tmp/motd /etc/motd

    # Set placeholder root password (alpine) unless someone has already
    # provisioned their ssh authorized keys
    if [ ! -f /home/root/.ssh/authorized_keys ]; then
        sed -r 's/root:.?:/root:xGVw8H4GqkKg6:/' /etc/shadow > /tmp/shadow
        chmod 400 /tmp/shadow
        mount --bind /tmp/shadow /etc/shadow

        # Enable root account (only required on old webOS versions)
        if grep -q 'root:\*:' /etc/passwd; then
            sed 's/root:\*:/root:x:/' /etc/passwd > /tmp/passwd
            chmod 444 /tmp/passwd
            mount --bind /tmp/passwd /etc/passwd
        fi

        echo '' >> /tmp/motd
        echo ' /!\ Your system is using a default password.' >> /tmp/motd
        echo ' /!\ Insert SSH public key into /home/root/.ssh/authorized_keys and perform a reboot to remove this warning.' >> /tmp/motd
        echo '' >> /tmp/motd
    else
        # Cleanup in case someone accidentally uploads a file with 777
        # permissions
        chmod 600 /home/root/.ssh/authorized_keys
        chown 0:0 /home/root/.ssh/authorized_keys
    fi

    # Do our best to neuter telemetry
    mkdir -p /tmp/.unwritable
    for path in /tmp/rdxd /tmp/uploadd /var/spool/rdxd /var/spool/uploadd/pending /var/spool/uploadd/uploaded; do
        mkdir -p $path
        mount -o bind,ro /tmp/.unwritable $path

        # Some older mount (webOS 3.x) does not support direct ro bind mount, so
        # this needs to be remounted after initial bind...
        mount -o bind,remount,ro /tmp/.unwritable $path
    done

    # Deprecate old path
    if [[ -d /home/root/unwritable ]]; then
      chattr -i /home/root/unwritable
      rm -rf /home/root/unwritable
    fi

    # Automatically elevate Homebrew Channel service
    elevate_script="${SERVICE_DIR}/elevate-service"
    if [[ -z "${SKIP_ELEVATION}" && -x "${elevate_script}" ]]; then
        "${elevate_script}"
    fi

    # Run user startup hooks
    mkdir -p /var/lib/webosbrew/init.d
    run-parts /var/lib/webosbrew/init.d 200>&-

    # Reset failsafe flag after a while
    sleep 10
    rm -rf /var/luna/preferences/webosbrew_failsafe
    sync -f /var/luna/preferences
fi
