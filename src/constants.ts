/**
 * Constants used throughout the MCP Lens extension
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Get the global MCP configuration path based on the operating system
 * 
 * @returns {string} The absolute path to the global MCP configuration file
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
 * Get the local MCP configuration path relative to workspace root
 * 
 * @param {string} workspaceRoot - The root path of the workspace
 * @returns {string} The absolute path to the local MCP configuration file
 */
export const getLocalMCPPath = (workspaceRoot: string): string => {
	return path.join(workspaceRoot, '.vscode', 'mcp.json');
};

/**
 * Extension command IDs
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
 * View IDs
 */
export const VIEWS = {
	MCP_EXPLORER: 'mcpExplorer',
} as const;
