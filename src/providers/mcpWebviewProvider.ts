/**
 * Webview Provider for MCP Explorer with elegant card grid layout
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { type MCPItem } from '../types';
import { getGlobalMCPPath, getLocalMCPPath } from '../constants';
import { readMCPFile, mcpFileToItems } from '../utils/fileUtils';
import { MCPClient } from '../utils/mcpClient';

export class MCPWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mcpExplorer';
	private _view?: vscode.WebviewView;
	private globalMCPs: MCPItem[] = [];
	private localMCPs: MCPItem[] = [];
	private mcpClients = new Map<string, MCPClient>();

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly outputChannel: vscode.OutputChannel
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			await this.handleMessage(data);
		});

		// Load MCPs initially
		this.loadMCPs();
	}

	public async loadMCPs(): Promise<void> {
		this.outputChannel.appendLine('\n--- Loading MCPs for Webview ---');

		// Stop all existing clients
		for (const client of this.mcpClients.values()) {
			await client.stop();
		}
		this.mcpClients.clear();

		// Load global MCPs
		const globalPath = getGlobalMCPPath();
		this.outputChannel.appendLine(`Global MCP path: ${globalPath}`);
		const globalFile = await readMCPFile(globalPath);
		this.globalMCPs = mcpFileToItems(globalFile, true);
		this.outputChannel.appendLine(`Loaded ${this.globalMCPs.length} global MCPs`);
		
		// Load local MCPs
		const workspaceFolders = vscode.workspace.workspaceFolders;
		this.outputChannel.appendLine(`Workspace folders: ${workspaceFolders?.length || 0}`);
		
		if (workspaceFolders?.[0]) {
			const localPath = getLocalMCPPath(workspaceFolders[0].uri.fsPath);
			this.outputChannel.appendLine(`Local MCP path: ${localPath}`);
			const localFile = await readMCPFile(localPath);
			this.localMCPs = mcpFileToItems(localFile, false);
			this.outputChannel.appendLine(`Loaded ${this.localMCPs.length} local MCPs`);
		} else {
			this.outputChannel.appendLine('No workspace folder found for local MCPs');
			this.localMCPs = [];
		}

		this.outputChannel.appendLine(
			`Total: ${this.globalMCPs.length} global, ${this.localMCPs.length} local`
		);

		// Update webview first to show MCPs
		this.updateWebview();

		// Then fetch tools in background (non-blocking)
		this.fetchToolsInBackground();
	}

	private async fetchToolsInBackground(): Promise<void> {
		// Fetch tools for all MCPs (this may take time)
		// Each MCP will update the UI as it loads
		await this.enrichMCPData(this.globalMCPs);
		await this.enrichMCPData(this.localMCPs);
	}

	private async enrichMCPData(mcps: MCPItem[]): Promise<void> {
		for (const mcp of mcps) {
			// Try to fetch real tools from MCP server
			try {
				await this.fetchToolsForMCP(mcp);
			} catch (error) {
				this.outputChannel.appendLine(`Failed to fetch tools for ${mcp.name}: ${error}`);
				// Set default values on error
				mcp.tools = [];
				mcp.toolCount = 0;
			}

			if (!mcp.description) {
				mcp.description = `MCP Server for ${mcp.name}`;
			}
			
			// Update UI after each MCP is processed for real-time updates
			this.outputChannel.appendLine(`Triggering UI update for ${mcp.name} (toolCount=${mcp.toolCount})`);
			this.updateWebview();
		}
	}

	private async fetchToolsForMCP(mcp: MCPItem): Promise<void> {
		this.outputChannel.appendLine(`\nFetching tools for: ${mcp.name}`);

		// Create and start MCP client
		const client = new MCPClient(mcp, this.outputChannel);
		
		try {
			// Start the server
			await client.start();
			this.outputChannel.appendLine(`Server started: ${mcp.name}`);

			// Fetch tools
			const tools = await client.listTools();
			this.outputChannel.appendLine(`Found ${tools.length} tools for ${mcp.name}`);

			mcp.tools = tools;
			mcp.toolCount = tools.length;
			mcp.status = 'running';
			this.outputChannel.appendLine(`Updated ${mcp.name}: status=${mcp.status}, toolCount=${mcp.toolCount}`);

			// Store client for later use
			this.mcpClients.set(mcp.name, client);

		} catch (error) {
			this.outputChannel.appendLine(`Error starting ${mcp.name}: ${error}`);
			mcp.status = 'error';
			mcp.tools = [];
			mcp.toolCount = 0;
			// Stop the client if it was created
			await client.stop();
		}
	}

	private updateWebview(): void {
		if (this._view && this._view.visible) {
			this.outputChannel.appendLine(`Updating webview: ${this.globalMCPs.length} global, ${this.localMCPs.length} local MCPs`);
			this._view.webview.postMessage({
				type: 'update',
				globalMCPs: this.globalMCPs,
				localMCPs: this.localMCPs,
			});
		} else {
			this.outputChannel.appendLine('View not ready for update');
		}
	}

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
			
			// Use VS Code's command to open with the proper editor
			// This will trigger the MCP UI if the file is recognized as an MCP config
			await vscode.commands.executeCommand('vscode.open', uri);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open configuration file: ${error}`);
		}
	}

	private getMCP(name: string, isGlobal: boolean): MCPItem | undefined {
		const mcps = isGlobal ? this.globalMCPs : this.localMCPs;
		return mcps.find((mcp) => mcp.name === name);
	}

	private async saveEnvironment(
		name: string,
		isGlobal: boolean,
		env: Record<string, string>
	): Promise<void> {
		const mcp = this.getMCP(name, isGlobal);
		if (mcp) {
			this.outputChannel.appendLine(`Saving environment for MCP: ${name}`);
			mcp.config.env = env;
			// TODO: Write back to MCP configuration file
			vscode.window.showInformationMessage(`Environment saved for ${name}`);
			this.updateWebview();
		}
	}

	/**
	 * Cleanup all MCP clients
	 */
	public async dispose(): Promise<void> {
		for (const client of this.mcpClients.values()) {
			await client.stop();
		}
		this.mcpClients.clear();
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>MCP Explorer</title>
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

		.header h2 {
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.refresh-btn {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			transition: background 0.2s;
		}

		.refresh-btn:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.section {
			margin-bottom: 24px;
		}

		.section {
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
			padding: 4px 8px;
			border-radius: 4px;
			transition: all 0.2s;
		}

		.configure-link:hover {
			background: var(--vscode-list-hoverBackground);
			text-decoration: underline;
		}

		.cards-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 12px;
		}

		.mcp-card {
			background: var(--vscode-sideBar-background);
			border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
			border-radius: 6px;
			padding: 14px;
			cursor: pointer;
			transition: all 0.2s ease;
			position: relative;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}

		.mcp-card:hover {
			background: var(--vscode-list-hoverBackground);
			border-color: var(--vscode-focusBorder);
			transform: translateY(-1px);
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		}

		.mcp-card.expanded {
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
	}		.card-actions {
			display: none;
			gap: 4px;
			margin-top: 12px;
			padding-top: 10px;
			border-top: 1px solid var(--vscode-panel-border);
			justify-content: flex-start;
		}

		.mcp-card.expanded .card-actions {
			display: flex;
		}

		.action-btn {
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 16px;
			border: 1px solid var(--vscode-button-border);
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border-radius: 4px;
			cursor: pointer;
			transition: all 0.15s;
			padding: 0;
		}

		.action-btn:hover:not(:disabled) {
			background: var(--vscode-button-secondaryHoverBackground);
			border-color: var(--vscode-focusBorder);
		}

		.action-btn:disabled {
			opacity: 0.3;
			cursor: not-allowed;
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
	</style>
</head>
<body>
	<div class="header">
		<h2>MCP Servers</h2>
		<button class="refresh-btn" onclick="refresh()">↻ Refresh</button>
	</div>

	<div id="content"></div>

	<script>
		const vscode = acquireVsCodeApi();
		let globalMCPs = [];
		let localMCPs = [];
		let expandedCard = null;

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

		function getDisplayName(name) {
			// Extract last part of path for cleaner display
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
			// Only show dot for unknown status
			if (status === 'unknown') return '';
			return status;
		}

		function createCard(mcp, isGlobal) {
			const status = getStatusClass(mcp);
			const isExpanded = expandedCard === mcp.name;
			const toolCount = mcp.toolCount || mcp.tools?.length || 0;
			const displayName = getDisplayName(mcp.name);
			const mcpType = mcp.config?.type || 'stdio';
			const typeInfo = getTypeInfo(mcpType);

			return \`
				<div class="mcp-card \${isExpanded ? 'expanded' : ''}" onclick="toggleCard('\${mcp.name}', \${isGlobal})">
				<div class="card-header">
					<div>
						<div class="card-title">\${displayName}</div>
						<div class="card-type" title="\${typeInfo.description}">\${typeInfo.icon} \${mcpType.toUpperCase()}</div>
					</div>
					<span class="status-badge \${status}">
						<span class="status-dot"></span>
						\${getStatusText(status)}
					</span>
				</div>

				<div class="card-meta">
					<span class="tool-count">🔧 \${toolCount} tools</span>
					\${status === 'running' && toolCount === 0 ? '<span class="loading-indicator"></span>' : ''}
				</div>				<div class="expanded-details">
					\${mcp.config?.env && Object.keys(mcp.config.env).length > 0 ? \`
						<div class="env-section" onclick="event.stopPropagation()" style="padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--vscode-panel-border);">
							<div class="detail-label">Environment:</div>
							<textarea 
								class="env-editor" 
								id="env-\${mcp.name}" 
								rows="5"
								onclick="event.stopPropagation()"
								onchange="markEnvChanged('\${mcp.name}')"
							>\${JSON.stringify(mcp.config.env, null, 2)}</textarea>
								<button 
									class="save-env-btn" 
									id="save-env-\${mcp.name}" 
									style="display: none;"
									onclick="saveEnvironment('\${mcp.name}', \${isGlobal}, event)"
								>💾 Save Changes</button>
							</div>
						\` : ''}
					\${toolCount > 0 ? \`
						<div class="tools-section" onclick="event.stopPropagation()" style="\${mcp.config?.env && Object.keys(mcp.config.env).length > 0 ? 'margin-top: 12px;' : 'padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--vscode-panel-border);'}">
							<button class="tools-toggle" onclick="toggleTools('\${mcp.name}', event)">
								<span class="toggle-icon">▶</span>
								<span>Tools (\${toolCount})</span>
							</button>
							<div class="tools-list" id="tools-\${mcp.name}" style="display: none;">
								\${(mcp.tools || []).map(tool => 
									\`<div class="tool-item" title="\${tool.description || ''}" onclick="event.stopPropagation()">
										<div class="tool-name">\${tool.name}</div>
											<div class="tool-description">\${tool.description || 'No description'}</div>
										</div>\`
									).join('')}
								</div>
							</div>
						\` : ''}
					</div>

				<div class="card-actions">
					<button class="action-btn" title="Start" onclick="startMCP('\${mcp.name}', \${isGlobal}, event)" \${status === 'running' ? 'disabled' : ''}>
						▶
					</button>
					<button class="action-btn" title="Stop" onclick="stopMCP('\${mcp.name}', \${isGlobal}, event)" \${status !== 'running' ? 'disabled' : ''}>
						⏹
					</button>
					<button class="action-btn" title="Restart" onclick="restartMCP('\${mcp.name}', \${isGlobal}, event)" \${status !== 'running' ? 'disabled' : ''}>
						↻
					</button>
				</div>
				</div>
			\`;
		}

		function toggleTools(name, event) {
			event.stopPropagation();
			const toolsList = document.getElementById('tools-' + name);
			const toggleIcon = event.currentTarget.querySelector('.toggle-icon');
			if (toolsList.style.display === 'none') {
				toolsList.style.display = 'block';
				toggleIcon.textContent = '▼';
			} else {
				toolsList.style.display = 'none';
				toggleIcon.textContent = '▶';
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

		function render() {
			const content = document.getElementById('content');
			
			if (globalMCPs.length === 0 && localMCPs.length === 0) {
				content.innerHTML = \`
					<div class="empty-state">
						<div class="empty-state-icon">📦</div>
						<p>No MCP servers found</p>
					</div>
				\`;
				return;
			}

			let html = '';

			if (globalMCPs.length > 0) {
				const isCollapsed = collapsedSections.global;
				html += \`
					<div class="section">
						<div class="section-header" onclick="toggleSection('global', event)">
							<div class="section-title-container">
								<span class="section-toggle \${isCollapsed ? 'collapsed' : ''}">\u25bc</span>
								<span class="section-title">Global MCPs (\${globalMCPs.length})</span>
							</div>
							<a class="configure-link" onclick="configure('global', event)">⚙️ Configure</a>
						</div>
						<div class="cards-grid" style="display: \${isCollapsed ? 'none' : 'grid'}">
							\${globalMCPs.map(mcp => createCard(mcp, true)).join('')}
						</div>
					</div>
				\`;
			}

			if (localMCPs.length > 0) {
				const isCollapsed = collapsedSections.local;
				html += \`
					<div class="section">
						<div class="section-header" onclick="toggleSection('local', event)">
							<div class="section-title-container">
								<span class="section-toggle \${isCollapsed ? 'collapsed' : ''}">\u25bc</span>
								<span class="section-title">Local MCPs (\${localMCPs.length})</span>
							</div>
							<a class="configure-link" onclick="configure('local', event)">⚙️ Configure</a>
						</div>
						<div class="cards-grid" style="display: \${isCollapsed ? 'none' : 'grid'}">
							\${localMCPs.map(mcp => createCard(mcp, false)).join('')}
						</div>
					</div>
				\`;
			}

			content.innerHTML = html;
		}

		// Initial render
		render();
	</script>
</body>
</html>`;
	}
}
