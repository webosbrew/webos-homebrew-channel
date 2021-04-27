#!/bin/bash

# This script does some early-boot initialization of rooted webOS devices. It's
# meant to be copied over to suitable path (eg. start-devmode.sh) to keep it
# safe from accidental homebrew channel app removal.

if [[ -f /var/luna/preferences/webosbrew_failsafe ]]; then
    # In case a reboot occured during last startup - open an emergency telnet
    # server and nag user to actually fix this. (since further reboots could
    # lead to devmode removal, etc...)

    telnetd -l /bin/sh
    sleep 1

    while true; do
        luna-send -a webosbrew -f -n 1 luna://com.webos.notification/createToast '{"sourceId":"webosbrew","message": "<b>Failsafe mode!</b> Open telnet and remove<br>/var/luna/preferences/webosbrew_failsafe"}'
        sleep 15;
    done
else
    # Set a failsafe flag and sync filesystem to make sure it actually gets
    # tripped...
    touch /var/luna/preferences/webosbrew_failsafe
    sync
    sleep 2

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
        telnetd -l /bin/sh
    fi

    # Start sshd
    if [[ -e /var/luna/preferences/webosbrew_sshd_enabled ]]; then
        mkdir -p /var/lib/webosbrew/sshd
        /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin/dropbear -R
    fi

    # Do our best to neuter telemetry
    mkdir -p /home/root/unwritable
    chattr +i /home/root/unwritable
    mount --bind /home/root/unwritable/ /var/spool/rdxd/
    mount --bind /home/root/unwritable/ /var/spool/uploadd/pending/
    mount --bind /home/root/unwritable/ /var/spool/uploadd/uploaded/

    # Automatically elevate Homebrew Channel service
    if [[ -x /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service ]]; then
        /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service
    fi

    # Run user startup hooks
    if [[ -d /var/lib/webosbrew/init.d ]]; then
        run-parts /var/lib/webosbrew/init.d
    fi

    # Reset failsafe flag after a while
    sleep 10
    rm /var/luna/preferences/webosbrew_failsafe
fi
