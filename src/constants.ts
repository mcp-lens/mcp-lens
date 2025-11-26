/**
 * Constants used throughout the MCP Lens extension
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Returns the platform-specific path to the global MCP configuration file.
 * The location varies by operating system:
 * - macOS: ~/Library/Application Support/Code/User/mcp.json
 * - Windows: %APPDATA%/Code/User/mcp.json
 * - Linux: ~/.config/Code/User/mcp.json
 * 
 * @returns The absolute path to the global MCP configuration file
 */
export const getGlobalMCPPath = (): string => {
	const platform = os.platform();
	const homeDir = os.homedir();

	switch (platform) {
		case 'darwin': // macOS
			return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
		case 'win32': // Windows
			return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Code', 'User', 'mcp.json');
		case 'linux':
			return path.join(homeDir, '.config', 'Code', 'User', 'mcp.json');
		default:
			return path.join(homeDir, '.config', 'Code', 'User', 'mcp.json');
	}
};

/**
 * Returns the workspace-specific path to the local MCP configuration file.
 * Local MCPs are stored in .vscode/mcp.json within the workspace root.
 * 
 * @param workspaceRoot - The absolute path to the workspace root directory
 * @returns The absolute path to the local MCP configuration file
 */
export const getLocalMCPPath = (workspaceRoot: string): string => {
	return path.join(workspaceRoot, '.vscode', 'mcp.json');
};

/**
 * Command identifiers used throughout the MCP Lens extension.
 * These IDs correspond to commands registered in package.json.
 */
export const COMMANDS = {
	REFRESH: 'mcp-lens.refresh',
	FILTER_BOTH: 'mcp-lens.filterBoth',
	FILTER_GLOBAL: 'mcp-lens.filterGlobal',
	FILTER_LOCAL: 'mcp-lens.filterLocal',
	OPEN_MCP_DETAILS: 'mcp-lens.openMCPDetails',
	OPEN_WITH_INSPECTOR: 'mcp-lens.openWithInspector',
	LOCATE_MCP_FILE: 'mcp-lens.locateMCPFile',
	START_MCP: 'mcp-lens.startMCP',
	STOP_MCP: 'mcp-lens.stopMCP',
	RESTART_MCP: 'mcp-lens.restartMCP',
} as const;

/**
 * View identifiers for the MCP Lens extension views.
 * These IDs correspond to views registered in package.json.
 */
export const VIEWS = {
	MCP_EXPLORER: 'mcpExplorer',
} as const;
