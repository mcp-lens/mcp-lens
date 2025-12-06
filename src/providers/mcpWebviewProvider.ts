/**
 * MCP Lens-specific webview provider for the explorer interface.
 * Manages the display and interaction with MCP servers through a webview-based UI.
 * Handles MCP server discovery, client lifecycle management, and bidirectional communication
 * between the webview and extension host.
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { type MCPItem } from '../types';
import { getGlobalMCPPath, getLocalMCPPath } from '../constants';
import { readMCPFile, mcpFileToItems } from '../utils/fileUtils';
import { MCPClient } from '../utils/mcpClient';

const CACHE_KEY_GLOBAL = 'mcpLens.globalMCPServers';
const CACHE_KEY_WORKSPACE = 'mcpLens.workspaceMCPServers';

export class MCPLensWebviewProvider implements vscode.WebviewViewProvider {
	/** View identifier matching package.json contribution point */
	public static readonly viewType = 'mcpExplorer';

	private _view?: vscode.WebviewView;
	private globalMCPServers: MCPItem[] = [];
	private workspaceMCPServers: MCPItem[] = [];
	private mcpClients = new Map<string, MCPClient>();

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly context: vscode.ExtensionContext
	) {
		this.restoreFromCache();
	}

	/**
	 * Restores MCP server data from the extension's global state cache.
	 * This ensures data persists across VS Code sessions.
	 */
	private restoreFromCache(): void {
		const cachedGlobal = this.context.globalState.get<MCPItem[]>(CACHE_KEY_GLOBAL);
		const cachedWorkspace = this.context.workspaceState.get<MCPItem[]>(CACHE_KEY_WORKSPACE);
		
		if (cachedGlobal && cachedGlobal.length > 0) {
			this.globalMCPServers = cachedGlobal.map(mcp => ({
				...mcp,
				status: 'stopped' as const,
				tools: [],
				toolCount: 0
			}));
			this.outputChannel.appendLine(`Restored ${cachedGlobal.length} global MCPs from cache`);
		}
		
		if (cachedWorkspace && cachedWorkspace.length > 0) {
			this.workspaceMCPServers = cachedWorkspace.map(mcp => ({
				...mcp,
				status: 'stopped' as const,
				tools: [],
				toolCount: 0
			}));
			this.outputChannel.appendLine(`Restored ${cachedWorkspace.length} workspace MCPs from cache`);
		}
	}

	/**
	 * Saves MCP server data to the extension's state cache for persistence.
	 */
	private async saveToCache(): Promise<void> {
		await this.context.globalState.update(CACHE_KEY_GLOBAL, this.globalMCPServers);
		await this.context.workspaceState.update(CACHE_KEY_WORKSPACE, this.workspaceMCPServers);
	}

	/**
	 * Resolves the webview view when it becomes visible.
	 * Sets up the webview HTML, message handlers, and initiates MCP server discovery.
	 */
	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): Promise<void> {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri,
				vscode.Uri.joinPath(this._extensionUri, 'resources')
			],
		};

		// Load HTML content
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			await this.handleMessage(data);
		});

		// Show cached data immediately if available
		if (this.globalMCPServers.length > 0 || this.workspaceMCPServers.length > 0) {
			this.updateWebview();
		}

		// Initiate MCP server discovery
		this.loadMCPs();
	}

	/**
	 * Loads MCP server configurations from global user settings and workspace-specific files.
	 * Terminates existing client connections, reads configuration files, and initiates
	 * background discovery of available tools from each server.
	 */
	public async loadMCPs(): Promise<void> {
		// Reload webview HTML to ensure fresh content with latest resources
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);
		}
		
		// Stop all existing client connections
		for (const client of this.mcpClients.values()) {
			await client.stop();
		}
		this.mcpClients.clear();

		// Load global MCP servers from user settings
		const globalPath = getGlobalMCPPath();
		const globalFile = await readMCPFile(globalPath);
		this.globalMCPServers = mcpFileToItems(globalFile, true);
		
		// Load workspace-specific MCP servers
		const workspaceFolders = vscode.workspace.workspaceFolders;
		
		if (workspaceFolders?.[0]) {
			const workspacePath = getLocalMCPPath(workspaceFolders[0].uri.fsPath);
			const workspaceFile = await readMCPFile(workspacePath);
			this.workspaceMCPServers = mcpFileToItems(workspaceFile, false);
			this.outputChannel.appendLine(`Loaded: ${globalPath} (${this.globalMCPServers.length}), ${workspacePath} (${this.workspaceMCPServers.length})`);
		} else {
			this.workspaceMCPServers = [];
			this.outputChannel.appendLine(`Loaded: ${globalPath} (${this.globalMCPServers.length})`);
		}

		// Save to cache for persistence
		await this.saveToCache();

		// Update webview first to show MCPs
		this.updateWebview();

		// Then fetch tools in background (non-blocking)
		this.fetchToolsInBackground();
	}

	/**
	 * Fetches tool information from all discovered MCP servers in the background.
	 * Updates the UI progressively as each server responds with its available tools.
	 */
	private async fetchToolsInBackground(): Promise<void> {
		await this.enrichMCPData(this.globalMCPServers);
		await this.enrichMCPData(this.workspaceMCPServers);
		// Save updated data with tools to cache
		await this.saveToCache();
	}

	/**
	 * Enriches MCP server items with runtime data by establishing connections and retrieving tool definitions.
	 * Each server is queried individually to discover its capabilities.
	 * 
	 * @param mcpServers - Array of MCP server items to enrich with runtime information
	 */
	private async enrichMCPData(mcpServers: MCPItem[]): Promise<void> {
		for (const server of mcpServers) {
			// Attempt to connect and fetch available tools
			try {
				await this.fetchToolsForMCP(server);
			} catch (error) {
				// Set default values on connection failure
				server.tools = [];
				server.toolCount = 0;
			}

			if (!server.description) {
				server.description = `Model Context Protocol server: ${server.name}`;
			}
			
			// Provide progressive UI updates as each server loads
			this.updateWebview();
		}
	}

	/**
	 * Establishes a connection to a specific MCP server and retrieves its tool definitions.
	 * Instantiates an MCP client, performs initialization handshake, and queries available tools.
	 * 
	 * @param server - The MCP server item to query for available tools
	 */
	private async fetchToolsForMCP(server: MCPItem): Promise<void> {
		// Instantiate MCP client for server communication
		const client = new MCPClient(server, this.outputChannel);
		
		try {
			// Establish connection and initialize protocol
			await client.start();

			// Query available tools from server
			const tools = await client.listTools();

			server.tools = tools;
			server.toolCount = tools.length;
			server.status = 'running';

			// Cache client for subsequent operations
			this.mcpClients.set(server.name, client);

		} catch (error) {
			server.status = 'error';
			server.tools = [];
			server.toolCount = 0;
			// Cleanup failed connection attempt
			await client.stop();
		}
	}

	/**
	 * Updates the webview UI with current MCP server data.
	 * Posts a message to the webview to trigger re-rendering with latest server information.
	 */
	private updateWebview(): void {
		if (this._view && this._view.visible) {
			this._view.webview.postMessage({
				type: 'update',
				globalMCPs: this.globalMCPServers,
				localMCPs: this.workspaceMCPServers,
			});
		}
	}

	/**
	 * Processes messages received from the webview UI.
	 * Routes incoming requests to appropriate handler methods based on message type.
	 * Implements bidirectional communication between webview and extension host.
	 * 
	 * @param data - Message payload from the webview containing type and action-specific data
	 */
	private async handleMessage(data: any): Promise<void> {
		switch (data.type) {
			case 'refresh':
				await this.loadMCPs();
				break;
			case 'startMCP':
				await this.startMCP(data.name, data.isGlobal);
				break;
			case 'stopMCP':
				await this.stopMCP(data.name, data.isGlobal);
				break;
			case 'restartMCP':
				await this.restartMCP(data.name, data.isGlobal);
				break;
			case 'configure':
				await this.openConfigFile(data.configType);
				break;
			case 'saveEnvironment':
				await this.saveEnvironment(data.name, data.isGlobal, data.env);
				break;
			case 'showLogs':
				this.showLogs(data.name);
				break;
		}
	}

	/**
	 * Starts an MCP server by name.
	 * 
	 * @param name - The name of the MCP to start
	 * @param isGlobal - Whether this is a global or workspace MCP
	 */
	private async startMCP(name: string, isGlobal: boolean): Promise<void> {
		const mcp = this.getMCP(name, isGlobal);
		if (!mcp) {
			return;
		}
		
		try {
			await this.fetchToolsForMCP(mcp);
			vscode.window.showInformationMessage(`Started ${name}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to start ${name}: ${error}`);
		}
		
		this.updateWebview();
	}

	/**
	 * Stops a running MCP server by name.
	 * 
	 * @param name - The name of the MCP to stop
	 * @param isGlobal - Whether this is a global or workspace MCP
	 */
	private async stopMCP(name: string, isGlobal: boolean): Promise<void> {
		const mcp = this.getMCP(name, isGlobal);
		if (!mcp) {
			return;
		}

		this.outputChannel.appendLine(`Stopping MCP: ${name}`);
		
		const client = this.mcpClients.get(name);
		if (client) {
			await client.stop();
			this.mcpClients.delete(name);
		}
		
		mcp.status = 'stopped';
		mcp.tools = [];
		mcp.toolCount = 0;
		
		this.updateWebview();
		vscode.window.showInformationMessage(`Stopped ${name}`);
	}

	/**
	 * Restarts an MCP server by stopping and starting it.
	 * 
	 * @param name - The name of the MCP to restart
	 * @param isGlobal - Whether this is a global or workspace MCP
	 */
	private async restartMCP(name: string, isGlobal: boolean): Promise<void> {
		const mcp = this.getMCP(name, isGlobal);
		if (!mcp) {
			return;
		}

		this.outputChannel.appendLine(`Restarting MCP: ${name}`);
		
		await this.stopMCP(name, isGlobal);
		await this.startMCP(name, isGlobal);
		
		vscode.window.showInformationMessage(`Restarted ${name}`);
	}

	/**
	 * Opens the MCP configuration file in VS Code.
	 * 
	 * @param configType - Type of configuration file to open ('global' or 'local')
	 */
	private async openConfigFile(configType: string): Promise<void> {
		try {
			let configPath: string;

			if (configType === 'global') {
				configPath = getGlobalMCPPath();
			} else {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders?.[0]) {
					vscode.window.showErrorMessage('No workspace folder found for local configuration');
					return;
				}
				configPath = getLocalMCPPath(workspaceFolders[0].uri.fsPath);
			}

			const uri = vscode.Uri.file(configPath);
			await vscode.commands.executeCommand('vscode.open', uri);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open configuration file: ${error}`);
		}
	}

	/**
	 * Retrieves an MCP server item by name from either global or workspace collections.
	 * 
	 * @param name - The unique identifier/name of the MCP server
	 * @param isGlobal - True to search global servers, false for workspace servers
	 * @returns The MCP server item if found, undefined if not present in the collection
	 */
	private getMCP(name: string, isGlobal: boolean): MCPItem | undefined {
		const servers = isGlobal ? this.globalMCPServers : this.workspaceMCPServers;
		return servers.find((server) => server.name === name);
	}

	/**
	 * Saves environment variables for an MCP.
	 * Note: Currently updates in-memory only. TODO: Persist to configuration file.
	 * 
	 * @param name - The name of the MCP
	 * @param isGlobal - Whether this is a global or workspace MCP
	 * @param env - Environment variables to save
	 */
	private async saveEnvironment(
		name: string,
		isGlobal: boolean,
		env: Record<string, string>
	): Promise<void> {
		const mcp = this.getMCP(name, isGlobal);
		if (mcp) {
			this.outputChannel.appendLine(`Saving environment for MCP: ${name}`);
			mcp.config.env = env;
			vscode.window.showInformationMessage(`Environment saved for ${name}`);
			this.updateWebview();
		}
	}

	/**
	 * Shows the output logs for a specific MCP server.
	 * Opens VS Code's output panel and shows the MCP Lens channel.
	 * 
	 * @param name - The name of the MCP server to show logs for
	 */
	private showLogs(name: string): void {
		this.outputChannel.appendLine(`Showing logs for MCP: ${name}`);
		this.outputChannel.show(true);
	}

	/**
	 * Cleans up resources by stopping all MCP clients.
	 * Called during extension deactivation.
	 */
	public async dispose(): Promise<void> {
		for (const client of this.mcpClients.values()) {
			await client.stop();
		}
		this.mcpClients.clear();
	}

	/**
	 * Loads and returns the HTML content for the webview from the template file.
	 * Reads the static HTML template and injects any necessary VS Code webview URIs.
	 * 
	 * @param webview - The webview instance to generate content for
	 * @returns Promise resolving to the complete HTML string for the webview
	 */
	private _getHtmlForWebview(webview: vscode.Webview): string {
		// Get URIs for SVG icons
		const getIconUri = (iconName: string) => {
			return webview.asWebviewUri(
				vscode.Uri.joinPath(this._extensionUri, 'resources', 'icons', `${iconName}.svg`)
			);
		};
		
		const playIconUri = getIconUri('play');
		const stopIconUri = getIconUri('stop');
		const restartIconUri = getIconUri('restart');
		const refreshIconUri = getIconUri('refresh');
		
		this.outputChannel.appendLine(`Icon URIs: play=${playIconUri}, stop=${stopIconUri}`);
		
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>MCP Lens Explorer</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 12px;
			overflow-x: hidden;
		}

		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 16px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.header h1 {
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

	.refresh-btn {
		background: transparent;
		color: var(--vscode-foreground);
		border: none;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		cursor: pointer;
		transition: opacity 0.2s ease;
		border-radius: 50%;
	}

	.refresh-btn:hover {
		opacity: 0.85;
	}		.section {
			margin-bottom: 20px;
		}

		.section-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 12px;
			cursor: pointer;
			padding: 4px;
			border-radius: 4px;
			transition: background 0.15s;
		}

		.section-header:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.section-title-container {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.section-toggle {
			font-size: 10px;
			transition: transform 0.2s;
		}

		.section-toggle.collapsed {
			transform: rotate(-90deg);
		}

		.section-title {
			font-size: 13px;
			font-weight: 600;
			color: var(--vscode-foreground);
			opacity: 0.9;
		}

		.configure-link {
			font-size: 11px;
			color: var(--vscode-textLink-foreground);
			cursor: pointer;
			text-decoration: none;
			padding: 4px 6px;
			transition: opacity 0.2s;
			background: transparent;
			border: none;
			font-family: var(--vscode-font-family);
			font-weight: normal;
			opacity: 0.8;
		}

		.configure-link:hover {
			opacity: 1;
		}

		.configure-link:focus-visible {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 1px;
		}

		.cards-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
			gap: 16px;
		}

		.mcp-card {
			background: var(--vscode-sideBar-background);
			border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			border-radius: 8px;
			padding: 16px;
			cursor: pointer;
			transition: all 0.2s ease;
			position: relative;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
		}

	.mcp-card:hover {
		background: var(--vscode-list-hoverBackground);
		border-color: var(--vscode-focusBorder);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
		transform: translateY(-1px);
	}		.mcp-card.expanded {
			grid-column: 1 / -1;
		}

		.card-header {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 8px;
		}

		.card-title {
			font-size: 13px;
			font-weight: 600;
			color: var(--vscode-foreground);
			margin-bottom: 4px;
		}

		.status-badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 3px 10px;
			border-radius: 10px;
			font-size: 11px;
			font-weight: 500;
			margin-top: 2px;
		}

		.status-badge.running {
			background: rgba(0, 200, 0, 0.15);
			color: #00c800;
		}

		.status-badge.stopped {
			background: rgba(150, 150, 150, 0.15);
			color: #999;
		}

		.status-badge.error {
			background: rgba(255, 0, 0, 0.15);
			color: #ff4444;
		}

		.status-badge.disabled {
			background: rgba(150, 150, 150, 0.1);
			color: #777;
		}

		.status-badge.unknown {
			background: transparent;
			padding: 3px;
		}

		.status-badge.unknown .status-dot {
			background: #ff4444;
		}

		.status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: currentColor;
		}

		.card-type {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 8px;
		}

		.card-description {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.4;
			margin-bottom: 10px;
			overflow: hidden;
			text-overflow: ellipsis;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
		}

		.card-meta {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 8px;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}

		.tool-count {
			display: flex;
			align-items: center;
			gap: 4px;
		}

		.card-actions {
			display: none;
			gap: 11px;
			margin-top: 16px;
			padding-top: 16px;
			border-top: 1px solid var(--vscode-panel-border);
			justify-content: flex-start;
			align-items: center;
		}

		.mcp-card.expanded .card-actions {
			display: flex;
		}

		.action-btn {
			width: 22px;
			height: 22px;
			display: flex;
			align-items: center;
			justify-content: center;
			border: none;
			background: transparent;
			cursor: pointer;
			transition: opacity 0.2s ease;
			padding: 0;
			border-radius: 50%;
		}

		.action-btn:hover:not(:disabled) {
			opacity: 0.85;
		}

		.action-btn:active:not(:disabled) {
			opacity: 0.7;
		}

		.action-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.logs-link {
			font-size: 11px;
			font-weight: 600;
			color: var(--vscode-textLink-foreground);
			text-decoration: none;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			padding: 4px 8px;
			margin-left: auto;
			cursor: pointer;
			transition: opacity 0.2s ease;
		}

		.logs-link:hover {
			opacity: 0.85;
		}

		/* SVG icon styling */
		.action-btn img {
			width: 22px;
			height: 22px;
			display: block;
			pointer-events: none;
		}

		.refresh-btn img {
			width: 20px;
			height: 20px;
			display: block;
			pointer-events: none;
		}

		.refresh-btn:active:not(:disabled) img {
			animation: rotate-refresh 0.6s linear;
		}

		@keyframes rotate-refresh {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}

		.expanded-details {
			display: none;
			margin-top: 12px;
		}

		.mcp-card.expanded .expanded-details {
			display: block;
		}

		.detail-row {
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
			font-size: 12px;
		}

		.detail-label {
			font-weight: 600;
			min-width: 80px;
			color: var(--vscode-foreground);
		}

		.detail-value {
			color: var(--vscode-descriptionForeground);
			word-break: break-all;
		}

		.tools-list {
			margin-top: 8px;
		}

		.tools-header {
			font-weight: 600;
			margin-bottom: 6px;
			font-size: 12px;
		}

		.env-section {
			margin-top: 12px;
		}

		.env-editor {
			width: 100%;
			font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
			font-size: 11px;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			padding: 8px;
			margin-top: 6px;
			resize: vertical;
		}

		.save-env-btn {
			margin-top: 8px;
			padding: 6px 12px;
			font-size: 11px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			transition: all 0.2s;
		}

		.save-env-btn:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.tools-section {
			margin-top: 12px;
		}

		.tools-toggle {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			padding: 8px;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			color: var(--vscode-foreground);
			font-size: 12px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s;
		}

		.tools-toggle:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.toggle-icon {
			font-size: 10px;
			transition: transform 0.2s;
		}

		.tools-list {
			margin-top: 8px;
			padding: 8px;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
		}

		.tool-item {
			padding: 8px;
			background: var(--vscode-sideBar-background);
			border-radius: 3px;
			margin-bottom: 6px;
			border: 1px solid var(--vscode-panel-border);
		}

		.tool-item:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.tool-name {
			font-size: 12px;
			font-weight: 600;
			color: var(--vscode-foreground);
			margin-bottom: 4px;
		}

		.tool-description {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.4;
			overflow: hidden;
			text-overflow: ellipsis;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
		}

		.loading-indicator {
			display: inline-block;
			width: 12px;
			height: 12px;
			border: 2px solid var(--vscode-progressBar-background);
			border-top-color: transparent;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			margin-left: 6px;
			vertical-align: middle;
		}

		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}

		.empty-state {
			text-align: center;
			padding: 40px 20px;
			color: var(--vscode-descriptionForeground);
		}

		.empty-state-icon {
			font-size: 48px;
			margin-bottom: 12px;
			opacity: 0.3;
		}

		/* Accessibility: Focus styles for keyboard navigation */
		*:focus-visible {
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}

		button:focus-visible,
		.mcp-card:focus-visible {
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: -2px;
		}

		.section-header:focus-visible {
			outline: 2px solid var(--vscode-focusBorder);
			outline-offset: 2px;
		}
	</style>
</head>
<body>
	<header class="header" role="banner">
		<h1 id="page-title">MCP Servers</h1>
		<button class="refresh-btn" onclick="refresh()" title="Refresh MCP servers list" aria-label="Refresh MCP servers list">
			<img src="${refreshIconUri}" alt="Refresh" />
		</button>
	</header>

	<main id="content" role="main" aria-labelledby="page-title"></main>

	<script>
		const ICON_PLAY = '${playIconUri}';
		const ICON_STOP = '${stopIconUri}';
		const ICON_RESTART = '${restartIconUri}';
		const ICON_REFRESH = '${refreshIconUri}';
		
		const vscode = acquireVsCodeApi();
		let globalMCPs = [];
		let localMCPs = [];
		let expandedCard = null;

		/**
		 * Escapes HTML special characters to prevent XSS attacks.
		 * @param {string} str - The string to escape
		 * @returns {string} The escaped string safe for HTML insertion
		 */
		function escapeHtml(str) {
			if (str === null || str === undefined) return '';
			return String(str)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'update') {
				globalMCPs = message.globalMCPs || [];
				localMCPs = message.localMCPs || [];
				render();
			}
		});

		function refresh() {
			vscode.postMessage({ type: 'refresh' });
		}

		function toggleCard(name, isGlobal) {
			expandedCard = expandedCard === name ? null : name;
			render();
		}

		function startMCP(name, isGlobal, event) {
			event.stopPropagation();
			vscode.postMessage({ type: 'startMCP', name, isGlobal });
		}

		function stopMCP(name, isGlobal, event) {
			event.stopPropagation();
			vscode.postMessage({ type: 'stopMCP', name, isGlobal });
		}

		function restartMCP(name, isGlobal, event) {
			event.stopPropagation();
			vscode.postMessage({ type: 'restartMCP', name, isGlobal });
		}

		function showLogs(name, isGlobal, event) {
			event.stopPropagation();
			vscode.postMessage({ type: 'showLogs', name, isGlobal });
		}

		function getDisplayName(name) {
			if (!name) return '';
			// If name ends with /mcp, remove it and return the rest
			if (name.toLowerCase().endsWith('/mcp')) {
				return name.slice(0, -4);
			}
			// Otherwise, return the last segment after /
			if (name.includes('/')) {
				const parts = name.split('/');
				return parts[parts.length - 1];
			}
			return name;
		}

		function getTypeInfo(type) {
			const types = {
				'stdio': { icon: '⚡', description: 'Standard I/O (Local Server)' },
				'http': { icon: '🌐', description: 'HTTP Server' },
				'sse': { icon: '📡', description: 'Server-Sent Events' }
			};
			return types[type] || { icon: '❓', description: 'Unknown Type' };
		}

		function getStatusClass(mcp) {
			if (mcp.config?.disabled) return 'disabled';
			return mcp.status || 'unknown';
		}

		function getStatusText(status) {
			if (status === 'unknown') return '';
			return status;
		}

		function createCard(mcp, isGlobal) {
			const status = getStatusClass(mcp);
			const isExpanded = expandedCard === mcp.name;
			const toolCount = mcp.toolCount || mcp.tools?.length || 0;
			const displayName = escapeHtml(getDisplayName(mcp.name));
			const safeName = escapeHtml(mcp.name);
			const mcpType = escapeHtml(mcp.config?.type || 'stdio');
			const typeInfo = getTypeInfo(mcp.config?.type || 'stdio');
			const safeTypeDescription = escapeHtml(typeInfo.description);
			const safeTypeIcon = escapeHtml(typeInfo.icon);

			return \`
				<div class="mcp-card \${isExpanded ? 'expanded' : ''}" 
					 role="listitem" 
					 tabindex="0" 
					 aria-expanded="\${isExpanded}" 
					 aria-label="\${displayName} MCP server, \${status} status, \${toolCount} tools available"
					 onclick="toggleCard('\${safeName}', \${isGlobal})"
					 onkeydown="handleKeyDown(event, (e) => toggleCard('\${safeName}', \${isGlobal}))">
					<div class="card-header">
						<div>
							<div class="card-title">\${displayName}</div>
							<div class="card-type" title="\${safeTypeDescription}" aria-label="Server type: \${safeTypeDescription}">
								<span aria-hidden="true">\${safeTypeIcon}</span> \${mcpType.toUpperCase()}
							</div>
						</div>
						<span class="status-badge \${status}" role="status" aria-label="Status: \${status}">
							<span class="status-dot" aria-hidden="true"></span>
							\${getStatusText(status)}
						</span>
					</div>

					<div class="card-meta" aria-label="Server metadata">
						<span class="tool-count">
							<span aria-hidden="true">🔧</span>
							<span aria-label="\${toolCount} tools available">\${toolCount} tools</span>
						</span>
						\${status === 'running' && toolCount === 0 ? '<span class="loading-indicator" role="status" aria-label="Loading tools"></span>' : ''}
					</div>

					<div class="expanded-details">
						\${mcp.config?.env && Object.keys(mcp.config.env).length > 0 ? \`
							<div class="env-section" onclick="event.stopPropagation()" style="padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--vscode-panel-border);">
								<label class="detail-label" for="env-\${safeName}">Environment Variables (JSON):</label>
								<textarea 
									class="env-editor" 
									id="env-\${safeName}" 
									rows="5"
									aria-label="Environment variables configuration in JSON format for \${displayName}"
									onclick="event.stopPropagation()"
									onchange="markEnvChanged('\${safeName}')"
								>\${escapeHtml(JSON.stringify(mcp.config.env, null, 2))}</textarea>
								<button 
									class="save-env-btn" 
									id="save-env-\${safeName}" 
									style="display: none;"
									aria-label="Save environment variable changes for \${displayName}"
									onclick="saveEnvironment('\${safeName}', \${isGlobal}, event)"
								><span aria-hidden="true">💾</span> Save Changes</button>
							</div>
						\` : ''}
						\${toolCount > 0 ? \`
							<div class="tools-section" onclick="event.stopPropagation()" style="\${mcp.config?.env && Object.keys(mcp.config.env).length > 0 ? 'margin-top: 12px;' : 'padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--vscode-panel-border);'}">
								<button class="tools-toggle" 
									 aria-expanded="false" 
									 aria-controls="tools-\${safeName}"
									 aria-label="Toggle tools list for \${displayName}, \${toolCount} tools available"
									 onclick="toggleTools('\${safeName}', event)">
									<span class="toggle-icon" aria-hidden="true">▶</span>
									<span>Tools (\${toolCount})</span>
								</button>
								<div class="tools-list" id="tools-\${safeName}" role="list" aria-label="Available tools" style="display: none;">
									\${(mcp.tools || []).map(tool => {
										const safeToolName = escapeHtml(tool.name);
										const safeToolDesc = escapeHtml(tool.description || 'No description');
										return \`<div class="tool-item" 
											 role="listitem" 
											 tabindex="0"
											 title="\${safeToolDesc}" 
											 aria-label="Tool: \${safeToolName}, \${safeToolDesc}"
											 onclick="event.stopPropagation()">
											<div class="tool-name">\${safeToolName}</div>
											<div class="tool-description">\${safeToolDesc}</div>
										</div>\`;
									}).join('')}
								</div>
							</div>
						\` : ''}
					</div>

					<div class="card-actions" role="group" aria-label="Server control actions">
						<button class="action-btn start-btn" 
							 title="Start \${displayName}"
							 aria-label="Start \${displayName} server"
							 onclick="startMCP('\${safeName}', \${isGlobal}, event)" 
							 \${status === 'running' ? 'disabled aria-disabled="true"' : ''}>
							<img src="\${ICON_PLAY}" alt="Start" />
						</button>
						<button class="action-btn stop-btn" 
							 title="Stop \${displayName}"
							 aria-label="Stop \${displayName} server"
							 onclick="stopMCP('\${safeName}', \${isGlobal}, event)" 
							 \${status !== 'running' ? 'disabled aria-disabled="true"' : ''}>
							<img src="\${ICON_STOP}" alt="Stop" />
						</button>
						<button class="action-btn restart-btn" 
							 title="Restart \${displayName}"
							 aria-label="Restart \${displayName} server"
							 onclick="restartMCP('\${safeName}', \${isGlobal}, event)" 
							 \${status !== 'running' ? 'disabled aria-disabled="true"' : ''}>
							<img src="\${ICON_RESTART}" alt="Restart" />
						</button>
						<a class="logs-link" 
							 href="#"
							 title="Show logs for \${displayName}"
							 aria-label="Show logs for \${displayName}"
							 onclick="showLogs('\${safeName}', \${isGlobal}, event)">LOGS</a>
					</div>
				</div>
			\`;
		}

		function toggleTools(name, event) {
			event.stopPropagation();
			const toolsList = document.getElementById('tools-' + name);
			const toggleIcon = event.currentTarget.querySelector('.toggle-icon');
			const isExpanded = toolsList.style.display !== 'none';
			
			if (toolsList.style.display === 'none') {
				toolsList.style.display = 'block';
				toggleIcon.textContent = '▼';
				event.currentTarget.setAttribute('aria-expanded', 'true');
			} else {
				toolsList.style.display = 'none';
				toggleIcon.textContent = '▶';
				event.currentTarget.setAttribute('aria-expanded', 'false');
			}
		}

		function markEnvChanged(name) {
			const saveBtn = document.getElementById('save-env-' + name);
			if (saveBtn) {
				saveBtn.style.display = 'block';
			}
		}

		function saveEnvironment(name, isGlobal, event) {
			event.stopPropagation();
			const editor = document.getElementById('env-' + name);
			try {
				const env = JSON.parse(editor.value);
				vscode.postMessage({ 
					type: 'saveEnvironment', 
					name, 
					isGlobal, 
					env 
				});
				const saveBtn = document.getElementById('save-env-' + name);
				if (saveBtn) {
					saveBtn.style.display = 'none';
					saveBtn.textContent = '✓ Saved';
					setTimeout(() => {
						saveBtn.textContent = '💾 Save Changes';
					}, 2000);
				}
			} catch (error) {
				alert('Invalid JSON: ' + error.message);
			}
		}

		function configure(type, event) {
			event.stopPropagation();
			vscode.postMessage({ type: 'configure', configType: type });
		}

		let collapsedSections = { global: false, local: false };

		function toggleSection(type, event) {
			event.stopPropagation();
			collapsedSections[type] = !collapsedSections[type];
			render();
		}

		function handleKeyDown(event, callback) {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				callback(event);
			}
		}

		function render() {
			const content = document.getElementById('content');
			
			if (globalMCPs.length === 0 && localMCPs.length === 0) {
				content.innerHTML = \`
					<div class="empty-state" role="status" aria-live="polite">
						<div class="empty-state-icon" aria-hidden="true">📦</div>
						<p>No MCP servers found</p>
					</div>
				\`;
				return;
			}

			let html = '';

			if (globalMCPs.length > 0) {
				const isCollapsed = collapsedSections.global;
				html += \`
					<section class="section" aria-labelledby="global-section-title">
						<div class="section-header" 
							 role="button" 
							 tabindex="0" 
							 aria-expanded="\${!isCollapsed}" 
							 aria-controls="global-mcps-grid"
							 onclick="toggleSection('global', event)"
							 onkeydown="handleKeyDown(event, (e) => toggleSection('global', e))">
						<div class="section-title-container">
							<span class="section-toggle \${isCollapsed ? 'collapsed' : ''}" aria-hidden="true">▼</span>
							<span class="section-title" id="global-section-title" title="User-level servers available across all workspaces">Global MCPs (\${globalMCPs.length})</span>
						</div>
							<button class="configure-link" onclick="configure('global', event)" title="Open mcp.json" aria-label="Configure global MCP servers">⚙️ Configure</button>
						</div>
						<div id="global-mcps-grid" class="cards-grid" role="list" style="display: \${isCollapsed ? 'none' : 'grid'}">
							\${globalMCPs.map(mcp => createCard(mcp, true)).join('')}
						</div>
					</section>
				\`;
			}

			if (localMCPs.length > 0) {
				const isCollapsed = collapsedSections.local;
				html += \`
					<section class="section" aria-labelledby="local-section-title">
						<div class="section-header" 
							 role="button" 
							 tabindex="0" 
							 aria-expanded="\${!isCollapsed}" 
							 aria-controls="local-mcps-grid"
							 onclick="toggleSection('local', event)"
							 onkeydown="handleKeyDown(event, (e) => toggleSection('local', e))">
						<div class="section-title-container">
							<span class="section-toggle \${isCollapsed ? 'collapsed' : ''}" aria-hidden="true">▼</span>
							<span class="section-title" id="local-section-title" title="Project-specific servers for this workspace only">Workspace MCPs (\${localMCPs.length})</span>
						</div>
							<button class="configure-link" onclick="configure('local', event)" title="Open .vscode/mcp.json" aria-label="Configure local workspace MCP servers">⚙️ Configure</button>
						</div>
						<div id="local-mcps-grid" class="cards-grid" role="list" style="display: \${isCollapsed ? 'none' : 'grid'}">
							\${localMCPs.map(mcp => createCard(mcp, false)).join('')}
						</div>
					</section>
				\`;
			}

			content.innerHTML = html;
		}

		render();
	</script>
</body>
</html>`;
	}
}
