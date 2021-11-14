# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Embedded manifests are now supported
- HTML description rendering
- Added SFTP server to our dropbear build. WinSCP should now work correctly.

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
