/**
 * MCP Lens-specific webview provider for the explorer interface.
 * Manages the display and interaction with MCP servers through a webview-based UI.
 * Handles MCP server discovery, client lifecycle management, and bidirectional communication
 * between the webview and extension host.
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { type MCPItem } from '../types';
import { getGlobalMCPPath, getLocalMCPPath } from '../constants';
import { readMCPFile, mcpFileToItems } from '../utils/fileUtils';
import { MCPClient } from '../utils/mcpClient';

export class MCPLensWebviewProvider implements vscode.WebviewViewProvider {
	/** View identifier matching package.json contribution point */
	public static readonly viewType = 'mcpExplorer';

	private _view?: vscode.WebviewView;
	private globalMCPServers: MCPItem[] = [];
	private workspaceMCPServers: MCPItem[] = [];
	private mcpClients = new Map<string, MCPClient>();

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly outputChannel: vscode.OutputChannel
	) {}

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
			localResourceRoots: [this._extensionUri],
		};

		// Load HTML template from file
		webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			await this.handleMessage(data);
		});

		// Initiate MCP server discovery
		this.loadMCPs();
	}

	/**
	 * Loads MCP server configurations from global user settings and workspace-specific files.
	 * Terminates existing client connections, reads configuration files, and initiates
	 * background discovery of available tools from each server.
	 */
	public async loadMCPs(): Promise<void> {
		this.outputChannel.appendLine('\n--- Loading MCP Server Configurations ---');

		// Stop all existing client connections
		for (const client of this.mcpClients.values()) {
			await client.stop();
		}
		this.mcpClients.clear();

		// Load global MCP servers from user settings
		const globalPath = getGlobalMCPPath();
		this.outputChannel.appendLine(`Global MCP configuration path: ${globalPath}`);
		const globalFile = await readMCPFile(globalPath);
		this.globalMCPServers = mcpFileToItems(globalFile, true);
		this.outputChannel.appendLine(`Discovered ${this.globalMCPServers.length} global MCP servers`);
		
		// Load workspace-specific MCP servers
		const workspaceFolders = vscode.workspace.workspaceFolders;
		this.outputChannel.appendLine(`Active workspace folders: ${workspaceFolders?.length || 0}`);
		
		if (workspaceFolders?.[0]) {
			const workspacePath = getLocalMCPPath(workspaceFolders[0].uri.fsPath);
			this.outputChannel.appendLine(`Workspace MCP configuration path: ${workspacePath}`);
			const workspaceFile = await readMCPFile(workspacePath);
			this.workspaceMCPServers = mcpFileToItems(workspaceFile, false);
			this.outputChannel.appendLine(`Discovered ${this.workspaceMCPServers.length} workspace MCP servers`);
		} else {
			this.outputChannel.appendLine('No workspace folder detected - skipping workspace MCPs');
			this.workspaceMCPServers = [];
		}

		this.outputChannel.appendLine(
			`Total servers: ${this.globalMCPServers.length} global, ${this.workspaceMCPServers.length} workspace`
		);

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
				this.outputChannel.appendLine(`Failed to fetch tools from ${server.name}: ${error}`);
				// Set default values on connection failure
				server.tools = [];
				server.toolCount = 0;
			}

			if (!server.description) {
				server.description = `Model Context Protocol server: ${server.name}`;
			}
			
			// Provide progressive UI updates as each server loads
			this.outputChannel.appendLine(`UI update: ${server.name} (${server.toolCount} tools)`);
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
		this.outputChannel.appendLine(`\nQuerying server: ${server.name}`);

		// Instantiate MCP client for server communication
		const client = new MCPClient(server, this.outputChannel);
		
		try {
			// Establish connection and initialize protocol
			await client.start();
			this.outputChannel.appendLine(`Connected to server: ${server.name}`);

			// Query available tools from server
			const tools = await client.listTools();
			this.outputChannel.appendLine(`Discovered ${tools.length} tools from ${server.name}`);

			server.tools = tools;
			server.toolCount = tools.length;
			server.status = 'running';
			this.outputChannel.appendLine(`Server status: ${server.name} - ${server.status} (${server.toolCount} tools)`);

			// Cache client for subsequent operations
			this.mcpClients.set(server.name, client);

		} catch (error) {
			this.outputChannel.appendLine(`Connection error for ${server.name}: ${error}`);
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
			this.outputChannel.appendLine(
				`Webview update: ${this.globalMCPServers.length} global, ${this.workspaceMCPServers.length} workspace servers`
			);
			this._view.webview.postMessage({
				type: 'update',
				globalMCPs: this.globalMCPServers,
				localMCPs: this.workspaceMCPServers,
			});
		} else {
			this.outputChannel.appendLine('Webview not visible - deferring update');
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

		this.outputChannel.appendLine(`Starting MCP: ${name}`);
		
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
	private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
		const htmlPath = path.join(
			this._extensionUri.fsPath,
			'src',
			'webview',
			'explorerView.html'
		);
		const htmlContent = await fs.readFile(htmlPath, 'utf-8');
		return htmlContent;
	}
}
