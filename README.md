webos-homebrew-channel
======================

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
async functions, const, etc.) while targetting NodeJS 0.10 (used on earliest
webOS versions)


### Production build
```sh
rm -rf dist && npm run build -- --production && npm run build-service -- --env production && npm run package
```

### Full application testing / deployment
```sh
rm -rf dist && npm run build && npm run build-service && npm run package && npm run deploy && npm run launch
```

### Service testing
```sh
npm run build-service && \
    cat dist/services/service.js | ssh root@10.0.0.2 -p 9922 sh -c 'cat > /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/service.js && pkill -f org.webosbrew.hbchannel.service'
ssh root@10.0.0.2 -p 9922 /usr/bin/run-js-service -k -n /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service
```
