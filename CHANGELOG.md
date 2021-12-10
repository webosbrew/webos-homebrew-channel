# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
