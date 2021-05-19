webos-homebrew-channel
======================

Features
--------

* Independent webOS package repository
    * Homebrew discovery, installation & updates

* (root) Root execution service that can be easily used by webOS homebrew
  developers without a need of separate privilege escalation handling (`luna://org.webosbrew.hbchannel.service/exec`)
* (root) Disable some telemetry
* (root) Startup user hooks (executable scripts present in `/var/lib/webosbrew/init.d` are run on bootup)
* (root) Remote access
    * SSH - public key authenticated (with default `alpine` password until
      authorized keys are provisioned)
    * Telnet - unauthenticated, use sparingly
* (root) Failsafe mode
    * In case a device crashes on boot only an emergency shell will be exposed
      via telnet. In order to disable it fix the original crash cause and remove
      `/var/luna/preferences/webosbrew_failsafe` flag file.

Installation
------------

## Automated
Execute the following snippet on target TV using SSH or Telnet:
```sh
curl -L https://raw.githubusercontent.com/webosbrew/webos-homebrew-channel/main/tools/install.sh | sh -

# Update startup script
cp /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh /media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh
```

## Manual
* Download [latest release
  `.ipk`](https://github.com/webosbrew/webos-homebrew-channel/releases/)
* Install it using `ares-install` SDK command or using the following command
  directly on a TV:
  ```sh
  luna-send-pub -i 'luna://com.webos.appInstallService/dev/install' '{"id":"org.webosbrew.hbchannel","ipkUrl":"/tmp/path/to/hbchannel.ipk","subscribe":true}'`
  ```
* (root) Elevate privileges by running:
  ```sh
  /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service
  ```
* (root) Update startup script:
  ```sh
  cp /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh /media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh
  ```

Development
-----------

### Environment
Some libraries used by this project are submodules of this repository. Use
following command when cloning:
```sh
git clone --recursive https://github.com/webosbrew/webos-homebrew-channel
```

All required development packages are distributed via npm. In order to install
them in a local directory run:
```sh
npm install
```

### Technology stack
Frontend is based on last development version of [enyo](https://github.com/enyojs).
(dated january 2017) While this definitely is not the cool and jazzy latest
technology, it provides us with a sensible UI toolkit for TV-based application
that seems to work pretty well with versions of webOS as old as 1.x. We are
currently using enyo built-in `enyo-dev` packager. This requires us to write
code that'll be run directly on target platforms (no babel/transpilation of newer
ES dialects - no arrow functions, no const, no promises, etc.). In the future
we may migrate to some webpack-based solution around that.

Service is packaged using webpack & babel, thus, with enough shims and patches,
we can write and use some modern ES features (like Promises, arrow functions,
async functions, const, etc.) while targeting NodeJS 0.10 (used on earliest
webOS versions)


### Production build
```sh
rm -rf dist && npm run build -- --production && npm run build-service -- --env production && npm run package
```

### Full application testing / deployment
```sh
rm -rf dist && npm run build && npm run build-service && npm run package && npm run deploy && npm run launch
ssh root@10.0.0.2 -p 9922 /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service
```

### Service testing
```sh
npm run build-service && \
    cat dist/services/service.js | ssh root@10.0.0.2 -p 9922 sh -c 'cat > /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/service.js && pkill -f org.webosbrew.hbchannel.service'
ssh root@10.0.0.2 -p 9922 /usr/bin/run-js-service -k -n /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service
```

### Update start-devmode.sh script
```sh
cp /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh /media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh
```

### Release engineering
```sh
npm version minor
git push origin main --tags
```
