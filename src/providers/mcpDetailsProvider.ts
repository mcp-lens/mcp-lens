/**
 * MCP Details View Provider
 * Displays detailed information about an MCP in a webview
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { type MCPItem } from '../types';

/**
 * Provides webview panel for displaying MCP details
 */
export class MCPDetailsProvider {
	private static currentPanel: vscode.WebviewPanel | undefined;

	/**
	 * Show MCP details in a webview panel
	 */
	static show(context: vscode.ExtensionContext, mcp: MCPItem): void {
		const column = vscode.ViewColumn.One;

		if (MCPDetailsProvider.currentPanel) {
			MCPDetailsProvider.currentPanel.reveal(column);
			MCPDetailsProvider.currentPanel.webview.html = this.getHtmlContent(mcp);
		} else {
			const panel = vscode.window.createWebviewPanel(
				'mcpDetails',
				`MCP: ${mcp.name}`,
				column,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);

			panel.webview.html = this.getHtmlContent(mcp);
			
			panel.onDidDispose(
				() => {
					MCPDetailsProvider.currentPanel = undefined;
				},
				null,
				context.subscriptions
			);

			MCPDetailsProvider.currentPanel = panel;
		}
	}

	/**
	 * Generate HTML content for the webview
	 */
	private static getHtmlContent(mcp: MCPItem): string {
		const statusColor = this.getStatusColor(mcp.status);
		const configJson = JSON.stringify(mcp.config, null, 2);
		
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>MCP: ${mcp.name}</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			padding: 20px;
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			line-height: 1.6;
		}
		h1 {
			color: var(--vscode-editor-foreground);
			border-bottom: 2px solid var(--vscode-panel-border);
			padding-bottom: 10px;
			margin-bottom: 20px;
		}
		h2 {
			color: var(--vscode-editor-foreground);
			margin-top: 24px;
			margin-bottom: 12px;
			font-size: 1.2em;
		}
		.section {
			margin-bottom: 24px;
			padding: 16px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border-radius: 4px;
		}
		.label {
			font-weight: 600;
			color: var(--vscode-textLink-foreground);
			display: inline-block;
			min-width: 120px;
		}
		.value {
			color: var(--vscode-foreground);
		}
		.status {
			display: inline-block;
			padding: 4px 12px;
			border-radius: 12px;
			font-size: 0.85em;
			font-weight: 600;
			background-color: ${statusColor};
			color: var(--vscode-button-foreground);
		}
		.code-block {
			background-color: var(--vscode-textBlockQuote-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			padding: 12px;
			font-family: var(--vscode-editor-font-family);
			font-size: 0.9em;
			overflow-x: auto;
			white-space: pre;
		}
		.badge {
			display: inline-block;
			padding: 2px 8px;
			background-color: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			border-radius: 10px;
			font-size: 0.85em;
			margin-left: 8px;
		}
		.info-row {
			margin: 8px 0;
		}
		.button {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.9em;
			margin-top: 12px;
		}
		.button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.tools-list {
			list-style: none;
			padding: 0;
		}
		.tool-item {
			padding: 12px;
			margin: 8px 0;
			background-color: var(--vscode-editor-background);
			border-left: 3px solid var(--vscode-textLink-foreground);
			border-radius: 4px;
		}
		.tool-name {
			font-weight: 600;
			color: var(--vscode-textLink-foreground);
			font-size: 1.05em;
		}
		.tool-description {
			margin-top: 4px;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<h1>${mcp.name}</h1>
	
	<div class="section">
		<h2>Overview</h2>
		<div class="info-row">
			<span class="label">Type:</span>
			<span class="value">${mcp.isGlobal ? 'Global' : 'Local'}</span>
			<span class="badge">${mcp.isGlobal ? 'GLOBAL' : 'LOCAL'}</span>
		</div>
		<div class="info-row">
			<span class="label">Status:</span>
			<span class="status">${mcp.status ?? 'unknown'}</span>
		</div>
		${mcp.mode ? `<div class="info-row">
			<span class="label">Mode:</span>
			<span class="value">${mcp.mode}</span>
		</div>` : ''}
		${mcp.author ? `<div class="info-row">
			<span class="label">Author:</span>
			<span class="value">${mcp.author}</span>
		</div>` : ''}
		<div class="info-row">
			<span class="label">Disabled:</span>
			<span class="value">${mcp.config.disabled ? 'Yes' : 'No'}</span>
		</div>
	</div>

	<div class="section">
		<h2>Configuration</h2>
		<div class="info-row">
			<span class="label">Command:</span>
			<span class="value">${mcp.config.command}</span>
		</div>
		${mcp.config.args?.length ? `<div class="info-row">
			<span class="label">Arguments:</span>
			<div class="code-block">${mcp.config.args.join('\n')}</div>
		</div>` : ''}
		${mcp.config.env && Object.keys(mcp.config.env).length > 0 ? `<div class="info-row">
			<span class="label">Environment:</span>
			<div class="code-block">${Object.entries(mcp.config.env).map(([k, v]) => `${k}=${v}`).join('\n')}</div>
		</div>` : ''}
		${mcp.config.alwaysAllow?.length ? `<div class="info-row">
			<span class="label">Always Allow:</span>
			<div class="code-block">${mcp.config.alwaysAllow.join('\n')}</div>
		</div>` : ''}
	</div>

	<div class="section">
		<h2>Full Configuration (JSON)</h2>
		<div class="code-block">${configJson}</div>
	</div>

	${mcp.tools?.length ? `<div class="section">
		<h2>Available Tools (${mcp.tools.length})</h2>
		<ul class="tools-list">
			${mcp.tools.map(tool => `
				<li class="tool-item">
					<div class="tool-name">${tool.name}</div>
					${tool.description ? `<div class="tool-description">${tool.description}</div>` : ''}
					${tool.inputSchema ? `<div class="code-block" style="margin-top: 8px;">${JSON.stringify(tool.inputSchema, null, 2)}</div>` : ''}
				</li>
			`).join('')}
		</ul>
	</div>` : '<div class="section"><p>No tool information available. Use MCP Inspector to discover tools.</p></div>'}

	${mcp.log ? `<div class="section">
		<h2>Log</h2>
		<div class="code-block">${mcp.log}</div>
	</div>` : ''}

	<div class="section">
		<button class="button" onclick="openInspector()">Open with MCP Inspector</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		
		function openInspector() {
			vscode.postMessage({
				command: 'openInspector',
				mcpName: '${mcp.name}'
			});
		}
	</script>
</body>
</html>`;
	}

	/**
	 * Get color for status badge
	 */
	private static getStatusColor(status?: string): string {
		switch (status) {
			case 'running':
				return 'var(--vscode-testing-iconPassed)';
			case 'error':
				return 'var(--vscode-errorForeground)';
			case 'stopped':
				return 'var(--vscode-descriptionForeground)';
			default:
				return 'var(--vscode-badge-background)';
		}
	}
}
