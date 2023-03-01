webos-homebrew-channel
======================

![image](https://user-images.githubusercontent.com/13520633/149569503-c9e13f40-ec44-43f0-b330-94a8a26081e5.png)

Features
--------

* Independent webOS package repository
    * Homebrew discovery, installation & updates
* Support for multiple repositories (outside of official
  [repo.webosbrew.org](https://repo.webosbrew.org)

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

## Updating
**If you already have Homebrew Channel installed** just launch Homebrew Channel
and select "Homebrew Channel" on apps browser view. "Update" button should be
clickable if an update is available for your installation.

If you need to reinstall any app for any reason press "5" button on app details
screen and "Update" button should change to "Reinstall" (and get enabled if it
wasn't before)

## Automated (recommended)
Latest Homebrew Channel version is automatically installed when rooting a TV
with https://rootmy.tv exploit.

## Automated
Execute the following snippet on target TV using SSH or Telnet:
```sh
curl -L https://raw.githubusercontent.com/webosbrew/webos-homebrew-channel/main/tools/install.sh | sh -

# Update startup script (assuming running as root)
cp /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh /var/lib/webosbrew/startup.sh
```

## Manual
* Download [latest release
  `.ipk`](https://github.com/webosbrew/webos-homebrew-channel/releases/)
* Install it using `ares-install` SDK command or using the following command
  directly on a TV:
  ```sh
  luna-send-pub -i 'luna://com.webos.appInstallService/dev/install' '{"id":"com.ares.defaultName","ipkUrl":"/tmp/path/to/hbchannel.ipk","subscribe":true}'`
  ```
* (root) Elevate privileges by running:
  ```sh
  /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service
  ```
* (root) Update startup script:
  ```sh
  cp /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh /var/lib/webosbrew/startup.sh
  ```

Interfaces
----------

## Luna service

This application exposes a Luna service that may be used by other homebrew
applications on Rooted devices:

### `luna://org.webosbrew.hbchannel.service/install`
Download, verify and install an application.

**Arguments:**

* `ipkUrl` [string] - HTTP(s) URL for `ipk` application to install
* `ipkHash` [string] - SHA256 checksum of downloaded `ipk` application
* `subscribe` [boolean] - subscribe for status updates

**Returns:**

* `finished` [boolean] - returns `true` when application has been fully
  installed
* `statusText` [string] - current status/progress message
* `progress` [number] - percentage download progress

### `luna://org.webosbrew.hbchannel.service/exec`
Root code execution - this *may* not execute as root, if a device is not rooted.

**Arguments:**

* `command` [string] - command to execute

**Returns:**

* `error` [string] - error that may have occured
* `stdoutString` [string] - stdout as a unicode string representation
* `stdoutBytes` [string] - stdout as a base64 representation
* `stderrString` [string] - stderr as a unicode string representation
* `stderrBytes` [string] - stderr as a base64 representation

### `luna://org.webosbrew.hbchannel.service/spawn`
Root code execution, spawn a long-running process - this *may* not execute as
root, if a device is not rooted.

**Arguments:**

* `command` [string] - command to execute

**Returns:**

* `type` [string] - one of `stdoutData`, `stderrData`, `close`, `exit`
    * `stdoutData` - data incoming on stdout pipe
        * `stdoutString` [string] - stdout as a unicode string representation
        * `stdoutBytes` [string] - stdout as a base64 representation
    * `stderrData` - data incoming on stderr pipe
        * `stderrString` [string] - stderr as a unicode string representation
        * `stderrBytes` [string] - stderr as a base64 representation
    * `close` - child process closed all its stdio streams
        * `closeCode` [number] - exit code
    * `exit` - child proess ended
        * `exitCode` [number] - exit code

### `luna://org.webosbrew.hbchannel.service/getAppInfo`
`luna://com.webos.applicationManager/getAppInfo` call replicated using
devmode-only endpoints.

## Repository management

webOS application (or remote device, via SSAP) may request Homebrew Launcher to
add an external repository, by launching it with the following launch params:

```json
{
    "launchMode": "addRepository",
    "url": "https://url-to-repository.com"
}
```

This will automatically jump to Settings view and open up "Add repository"
prompt with URL filled in.

This can be tested by using `ares-launch` as follows:
```sh
ares-launch org.webosbrew.hbchannel -p '{"launchMode":"addRepository","url":"https://google.com"}'
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

### Development TV setup

#### Configuring @webosose/ares-cli with Developer Mode App
This is partially based on: https://webostv.developer.lge.com/develop/app-test/using-devmode-app/
* Install Developer Mode app from Content Store
* Enable developer mode, enable keyserver
* Download TV's private key: `http://TV_IP:9991/webos_rsa`
* Configure the device using `ares-setup-device` (`-a` may need to be replaced with `-m` if device named `webos` is already configured)
  * `PASSPHRASE` is the 6-character passphrase printed on screen in developer mode app
```sh
ares-setup-device -a webos -i "username=prisoner" -i "privatekey=/path/to/downloaded/webos_rsa" -i "passphrase=PASSPHRASE" -i "host=TV_IP" -i "port=9922"
```

#### Configuring @webosose/ares-cli with rooted TV
* Enable sshd in Homebrew Channel app
* Generate ssh key on developer machine (`ssh-keygen`)
* Copy the public key (`id_rsa.pub`) to `/home/root/.ssh/authorized_keys` on TV
* Configure the device using `ares-setup-device` (`-a` may need to be replaced with `-m` if device named `webos` is already configured)
```sh
ares-setup-device -a webos -i "username=root" -i "privatekey=/path/to/id_rsa" -i "passphrase=SSH_KEY_PASSPHRASE" -i "host=TV_IP" -i "port=22"
```

**Note:** @webosose/ares-cli doesn't need to be installed globally - you can use a package installed locally after `npm install` in this repo by just prefixing above commands with local path, like so: `node_modules/.bin/ares-setup-device ...`

### Frontend development
EnyoJS is able to watch for frontend changes, but does not expose a HTTP server.

```sh
npm run build -- --watch

# ...in a separate terminal:
python -m http.server -d dist/
```

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
ssh root@10.0.0.2 /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/run-js-service -k -n /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service
```

### Update startup.sh script
```sh
cp /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh /var/lib/webosbrew/startup.sh
```

### Release engineering
```sh
npm version minor
git push origin main --tags
```

### Testing
Before every release following features should be verified:

* Releases with startup.sh updates:
  * A single "/var/lib/webosbrew/startup.sh updated!" or
    "/media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh
    updated!" notification should pop up on first Homebrew Channel launch *once*.
  * Further app launches should *not* show any other notifications (unless
    Homebrew Channel is rolled back to some older version)

* Non-installed app info page:
  * Install button should be enabled
  * Launch button should be disabled
  * "Project page" and inline application description links should be clickable
    and should open system browser
  * After clikcing "Install" button should transform into a progress bar
  * Installation should finish with "Application installed: Application Name" -
    no other notifications should be shown.
  * After installation "Launch" button should be enabled, "Install" button
    should be disabled and called "Completed"

* Installed app info page:
  * Update button should be disabled
  * Launch button should be enabled and should launch selected application
  * After pressing remote button 5 disabled "Update" button should transform to
    enabled "Reinstall" button. Clicking it should perform usual package
    installation.
  * Uninstall button should be enabled and should remove an application when
    pressed.
  * On Homebrew Channel app info page Launch and Uninstall buttons shoud always
    be *disabled*.
  * If an update is available for application "Version" should show eg. "0.1.2
    (installed: 0.1.0)"

* Homebrew Channel Self-update - reinstall/update can be force-enabled by
  pressing remote button 5 on Homebrew Channel app page.
  * Self-update should show the following notifications:
    * Performing self-update...
    * Performing self-update (inner)
    * Elevating...
    * Self-update finished!
  * "Package info fetch failed: ..." notification should *not* be shown.

* Settings page:
  * Root status should show "ok"
  * "System reboot" button should perform a full system reboot
  * "Add repository" button should show an URL text prompt. Entering an invalid
    url "aaa" and going back to main page should show "An error occured while
    downloading some repositories: aaa (0)". Main page should still be
    navigatable and applications should be installable. Pressing on "aaa"
    repository in settings should remove it from the list.
  * Switching off all repositories (Default repository / Extra non-free
    software) and going back to main page should produce an empty page without
    any errors. Going back to settings and enabling these back again should
    populate main apps list page back again.
  * Switching "Root Configuration" options should not show any errors. "Root
    Configuration" option values should be saved immediately - after going back
    to main page, then going to settings again - these should show correct
    values, as last set on the settings page. (a second ago)
    After pressing "System reboot" apropriate configuration should get applied.

* Root execution service:
  * Homebrew using `/exec` and other endpoints should work correctly. Good
    testing target is "Custom Screensaver" app since it uses plain `/exec` calls
    without going through its own service.

* Autostart:
  * On TVs without persistent script boot hook (eg. crashd) Telnet/sshd should
    be accessible (when enabled) *before launching Homebrew Channel itself*.
