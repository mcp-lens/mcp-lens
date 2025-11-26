/**
 * Type definitions for MCP Lens extension
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

/**
 * Represents a parameter definition for an MCP tool.
 * Describes the input requirements for tool invocation.
 */
export interface MCPToolParameter {
	name: string;
	type: string;
	description?: string;
	required?: boolean;
	default?: unknown;
}

/**
 * Represents a tool exposed by an MCP server.
 * Tools are callable functions that provide specific capabilities to AI models.
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
 * Represents the structure of an MCP configuration file (VS Code format).
 * This matches the schema used in mcp.json files for both global and workspace configurations.
 * 
 * @see https://code.visualstudio.com/docs/copilot/customization/mcp-servers
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
 * Represents an MCP server instance with runtime state and metadata.
 * Combines configuration with dynamic information like status, tools, and connection state.
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
 * Filter options for displaying MCPs in the explorer view.
 * - 'both': Show both global and workspace MCPs
 * - 'global': Show only global MCPs (from user settings)
 * - 'local': Show only workspace-specific MCPs
 */
export type MCPFilter = 'both' | 'global' | 'local';

/**
 * Tree item types used in the MCP explorer view for categorizing display elements.
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
 * Platform-specific MCP configuration file paths.
 */
export interface OSPaths {
	globalMCPPath: string;
	localMCPPath: string;
}
