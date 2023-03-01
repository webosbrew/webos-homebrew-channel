# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.3] - 2023-03-01
### Fixed
- Fix Homebrew Channel self-update/reelevation on webOS 22

## [0.6.2] - 2023-02-24
### Changed
- Disabled Launch/Uninstall button on Homebrew Channel application details page
  to prevent accidental removals. Homebrew Channel can still technically be
  removed by long-pressing its icon on home screen, but this will of course
  break most of root-related functionality and prevent further rooting until
  factory reset in many cases.

## [0.6.1] - 2023-02-20
### Fixed
- Support for legacy SCP protocol over SSH
- `/checkRoot` endpoint

## [0.6.0] - 2023-02-18
### Added
- Uninstall button present on app details page
- Autostart hook is now launched on app start, if it has not been run yet
- Currently installed app version is displayed now if update is available
- `/var/lib/webosbrew/init.d` directory is now automatically created on startup

### Fixed
- dropbear sshd patched to support webOS 22 (7.x)
- Fixed `/autostart` endpoint on webOS 4.0
- Fixed luna-service2 fd leak causing Homebrew Channel service to fail after 60
  seconds if used for autostart on certain webOS versions.

## [0.5.1] - 2022-07-17
### Added
- Autostart scripts are now launched on webOS 4.5+ without any existing boot
  hooks.
- Warning message discouraging people from modifying system partitions has been
  added to motd.

## [0.5.0] - 2022-03-03
### Added
- Added "webosbrew.org Non-free software" repository switch - this may contain
  software that is distributed under non-free/open source licenses. This is
  disabled by default and can be enabled in Settings.
- Added automatic updates of startup scripts. Homebrew Channel will now check
  checksums of known startup script paths against known list of "official"
  scripts and automatically update them if they match, or show a notification
  when a manual intervention is needed. (when a script has been modified)
- Failsafe mode will now be automatically disabled after 15 seconds and an alert
  to reboot will be shown.
- `authorized_keys` file permissions are now fixed up automatically on boot.

### Changed
- Application name is now rendered in "Application installed" toast messages
- Homebrew Channel icon is now properly displayed in toasts/notifications
- Startup script will now use /tmp subdirectory for dummy telemetry blocking
  directory to reduce leftovers after Factory Resets of rooted devices. Updated
  list of blocked telemetry paths.

### Fixed
- Startup script shall now be ran only once (courtesy of @stek29)
- Fix root password authentication on webOS 1.x-2.x (courtesy of @ledoge)
- Rebuilt ssh-related binaries to support webOS 1.x

## [0.4.0] - 2022-01-13
### Added
- `elevate-service` script now properly handles Native Services - including
  fixing Native Services API permissions before webOS 4.x
- Support for multiple repositories

## [0.3.2] - 2021-12-10
### Added
- Added app reinstall option - install button is reenabled after pressing "5" on
  app details page

### Fixed
- Fixed reelevation on webOS 4.x+
- Fixed ls-hubd crash on upgrade on webOS 4.x

### Changed
- User-friendly error is now shown if homebrew channel is not elevated and not
  running via developer mode
- `elevate-service` has been rewritten in TypeScript, existing CLI interface is
  kept intact

## [0.3.1] - 2021-11-21
### Fixed
- Fixed root persistence (reelevation) after self-update

## [0.3.0] - 2021-11-21
### Added
- Embedded manifests are now supported
- HTML description rendering
- Added SFTP server to our dropbear build. WinSCP should now work correctly
- Added Support for webOS 1.x and 2.x

### Fixed
- Homebrew can now properly use Homebrew Channel service for root code execution

## [0.2.1] - 2021-05-16
### Fixed
- Fixed application download failure

## [0.2.0] - 2021-05-16
### Changed
- Updated icons, added splashscreen
- Service rewritten to TypeScript

### Fixed
- Improved support for webOS >=4.x by extending Luna Service Bus permissions
  during service elevation
- Fixed early install failure error handling - install will no longer hang if
  `appinstalld` call fails

## [0.1.1] - 2021-05-06
### Fixed
- Fixed service startup

## [0.1.0] - 2021-05-06
### Added
- Initial release

[Unreleased]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/webosbrew/webos-homebrew-channel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/webosbrew/webos-homebrew-channel/releases/tag/v0.1.0
