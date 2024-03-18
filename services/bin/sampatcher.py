#!/usr/bin/env python2

import re
import sys

TARGET_STRING      = "luna://com.webos.service.sm/license/apps/getDrmStatus"
REPLACEMENT_STRING = "luna://org.webosbrew.hbchannel.service/getDrmStatus\0"

sam_pid = int(sys.argv[1])

memfile = open("/proc/%d/mem" % sam_pid, "w+")

for mapping in open("/proc/%d/maps" % sam_pid, "r").readlines():
    start_addr, end_addr, perms = re.match(r"([0-9a-f]+)\-([0-9a-f]+)\s(\S+)\s", mapping).groups()
    if not perms.startswith("r"):
        continue
    start_addr = int(start_addr, 16)
    end_addr = int(end_addr, 16)
    map_size = end_addr - start_addr

    memfile.seek(start_addr)
    buf = memfile.read(map_size)

    if TARGET_STRING in buf:
        print("Found target string!")
        addr = start_addr + buf.index(TARGET_STRING)
        memfile.seek(addr)
        memfile.write(REPLACEMENT_STRING)
        memfile.close()
        print("Replaced target string!")
        break
else:
    print("ERROR: Failed to find target string")

