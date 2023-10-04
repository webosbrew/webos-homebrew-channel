#define DSS_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_dss_host_key"
#define RSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_rsa_host_key"
#define ECDSA_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ecdsa_host_key"
#define ED25519_PRIV_FILENAME "/var/lib/webosbrew/sshd/dropbear_ed25519_host_key"
#define DEFAULT_PATH "/home/root/.local/bin:/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin:/usr/bin:/bin"
#define DEFAULT_ROOT_PATH "/home/root/.local/bin:/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin:/usr/sbin:/usr/bin:/sbin:/bin"
#define DROPBEAR_SFTPSERVER 1

#define SFTPSERVER_PATH_FALLBACK "/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/bin/sftp-server"

#include <string.h>
#include <stdlib.h>

static const char* get_sftp_server_path() {
    static char path[4096] = "";
    if (path[0] == '\0') {
        char *dropbear_path = realpath("/proc/self/exe", path);
        char *last_slash;
        if (dropbear_path == NULL) {
            strncpy(path, SFTPSERVER_PATH_FALLBACK, sizeof(path));
            return path;
        }
        last_slash = strrchr(dropbear_path, '/');
        if (last_slash == NULL) {
            strncpy(path, SFTPSERVER_PATH_FALLBACK, sizeof(path));
            return path;
        }
        strcpy(last_slash + 1, "sftp-server");
    }
    return path;
}

#define SFTPSERVER_PATH get_sftp_server_path()
