/**
 * Type definitions for MCP Lens extension
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

/**
 * Represents a parameter for an MCP tool
 */
export interface MCPToolParameter {
	name: string;
	type: string;
	description?: string;
	required?: boolean;
	default?: unknown;
}

/**
 * Represents a tool available in an MCP
 */
export interface MCPTool {
	name: string;
	description?: string;
	parameters?: MCPToolParameter[];
	inputSchema?: Record<string, unknown>;
}

/**
 * Represents the configuration for a single MCP server
 * 
 * Standard MCP Server Fields (from VS Code documentation):
 * @see https://code.visualstudio.com/docs/copilot/customization/mcp-servers
 * 
 * For stdio servers:
 * - type (Required): Server connection type - "stdio", "http", "sse"
 * - command (Required): Command to start server executable (e.g., "npx", "node", "python", "docker")
 * - args (Optional): Array of arguments passed to command
 * - env (Optional): Environment variables for the server (can use ${input:api-key} syntax)
 * - envFile (Optional): Path to environment file to load variables (e.g., "${workspaceFolder}/.env")
 * 
 * For HTTP/SSE servers:
 * - type (Required): "http" or "sse"
 * - url (Required): URL of the server
 * - headers (Optional): HTTP headers for authentication
 */
export interface MCPConfig {
	/** Communication type: stdio, http, or sse */
	type: 'stdio' | 'http' | 'sse' | 'socket' | 'ipc';
	/** Command to start the MCP server (required for stdio) */
	command: string;
	/** Arguments for the command (optional) */
	args?: string[];
	/** Environment variables (optional) */
	env?: Record<string, string>;
	/** Path to environment file (optional) */
	envFile?: string;
	/** URL for HTTP/SSE servers (required for http/sse types) */
	url?: string;
	/** HTTP headers for authentication (optional, for http/sse) */
	headers?: Record<string, string>;
	/** MCP server version */
	version?: string;
	/** Whether server is in gallery/marketplace */
	gallery?: boolean;
	/** Whether server is disabled */
	disabled?: boolean;
	/** Tools that don't require permission */
	alwaysAllow?: string[];
}

/**
 * Input definition for MCP servers
 */
export interface MCPInput {
	name: string;
	type: string;
	default?: unknown;
	description?: string;
}

/**
 * Command definition for MCP servers
 */
export interface MCPCommand {
	name: string;
	args?: string[];
	description?: string;
}

/**
 * Represents the structure of an MCP JSON file (VSCode format)
 */
export interface MCPFile {
	/** Map of server name to configuration */
	servers: Record<string, MCPConfig>;
	/** Optional inputs configuration */
	inputs?: MCPInput[];
	/** Optional commands configuration */
	commands?: MCPCommand[];
}

/**
 * Represents an MCP item with runtime information
 */
export interface MCPItem {
	name: string;
	config: MCPConfig;
	isGlobal: boolean;
	tools?: MCPTool[];
	status?: 'running' | 'stopped' | 'error' | 'unknown';
	log?: string;
	author?: string;
	mode?: string;
	description?: string;
	toolCount?: number;
}

/**
 * Filter options for MCP view
 */
export type MCPFilter = 'both' | 'global' | 'local';

/**
 * Tree item types for elegant inline UI
 */
export type TreeItemType =
	| 'section'
	| 'mcp-card'
	| 'info-row'
	| 'status-row'
	| 'tools-header'
	| 'tool-item'
	| 'resources-header';

/**
 * OS-specific paths configuration
 */
export interface OSPaths {
	globalMCPPath: string;
	localMCPPath: string;
}
