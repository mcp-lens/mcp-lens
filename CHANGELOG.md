# Change Log

All notable changes to the "mcp-lens" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [1.0.7] - 2025-12-06

### Changed
- fix: security and ux improvements (#31)


## [1.0.6] - 2025-12-06

### Changed
- chore: release v1.0.5


## [1.0.5] - 2025-11-27

### Changed
- chore: release v1.0.4


## [1.0.4] - 2025-11-27

### Changed
- chore: release v1.0.3


## [1.0.3] - 2025-11-27

### Changed
- chore: release v1.0.2


## [1.0.2] - 2025-11-27

### Changed
- fix: update screenshots (#30)


## [1.0.1] - 2025-11-27

### Changed
- fix: update screenshot from PNG to JPG format (#29)


## [1.0.0] - 2025-11-27

### Changed
- fix!: enoent html file error in prod (#28)


## [0.2.3] - 2025-11-27

### Fixed
- Fixed ENOENT error when extension is installed from marketplace by ensuring HTML files are included in packaged extension
- Updated build process to copy webview HTML files to output directory
- Added fallback path resolution for HTML files to support both development and production environments

## [0.2.2] - 2025-11-27

### Changed
- chore: icon updates (#27)


## [0.2.1] - 2025-11-27

### Changed
- chore: Update icon reference to mcp-lens-icon-v3.png (#26)


## [0.2.0] - 2025-11-26

### Changed
- feat: Add PAT token support for bypassing branch protection (#23)


## [0.1.1] - 2025-01-26

### Fixed
- Parse only commit title for version detection to avoid PR template syntax errors
- Fixed shell interpretation errors in CI workflow from PR template content

## [0.1.0] - 2025-01-25

### Added
- Initial release
- Interactive MCP explorer for VS Code
- Support for both global and local MCP servers
- Tree view with server details, tools, prompts, and resources
- Real-time server status monitoring
- Start/Stop/Restart controls for MCP servers
- Filter capabilities (Global/Local/Both)
- Webview-based detailed information panel
