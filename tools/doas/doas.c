#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(int argc, char *argv[], char *envp[])
{
	if (argc < 4) {
		printf("USAGE: %s uid gid command\n", argv[0]);
		return -1;
	}

	uid_t uid = atoi(argv[1]);
	uid_t gid = atoi(argv[2]);

	// Break out of jail, if we're in one
	if (chroot("/proc/1/root/") != 0) {
		perror("doas: chroot");
		return -1;
	}

	if (setresgid(gid, gid, gid) != 0) {
		perror("doas: setresgid");
		return -1;
	}

	if (setresuid(uid, uid, uid) != 0) {
		perror("doas: setresuid");
		return -1;
	}

	execve(argv[3], &argv[3], envp);
	perror("doas: execve"); // execve only returns on error
	return -1;
}
