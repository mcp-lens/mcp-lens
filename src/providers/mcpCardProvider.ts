/**
 * Elegant tree data provider for MCP Explorer with inline expansion
 * Inspired by Cline's beautiful MCP interface design
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { type MCPItem, type MCPFilter, type TreeItemType } from '../types';
import { getGlobalMCPPath, getLocalMCPPath } from '../constants';
import { readMCPFile, mcpFileToItems } from '../utils/fileUtils';

/**
 * Elegant tree item for clean inline expansion UI
 */
export class MCPCardTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: TreeItemType,
		public readonly mcpItem?: MCPItem,
		public readonly parentMcp?: MCPItem
	) {
		super(label, collapsibleState);
		this.contextValue = itemType;
		this.setupItem();
	}

	private setupItem(): void {
		switch (this.itemType) {
			case 'section':
				this.setupSection();
				break;
			case 'mcp-card':
				this.setupMCPCard();
				break;
			case 'info-row':
				this.setupInfoRow();
				break;
			case 'status-row':
				this.setupStatusRow();
				break;
			case 'tools-header':
				this.setupToolsHeader();
				break;
			case 'tool-item':
				this.setupToolItem();
				break;
			case 'resources-header':
				this.setupResourcesHeader();
				break;
		}
	}

	private setupSection(): void {
		this.iconPath = undefined;
		this.description = '';
	}

	private setupMCPCard(): void {
		if (!this.mcpItem) return;

		const mcp = this.mcpItem;
		const status = mcp.config.disabled ? 'disabled' : (mcp.status || 'unknown');
		
		// Clean card with status indicator
		this.iconPath = this.getStatusIcon(status);
		this.description = this.getStatusBadge(status);
		this.tooltip = this.createTooltip(mcp);
	}

	private setupInfoRow(): void {
		this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('descriptionForeground'));
	}

	private setupStatusRow(): void {
		if (!this.parentMcp) return;
		this.iconPath = new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.blue'));
	}

	private setupToolsHeader(): void {
		this.iconPath = new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.orange'));
	}

	private setupToolItem(): void {
		this.iconPath = new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
	}

	private setupResourcesHeader(): void {
		this.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple'));
	}

	private getStatusIcon(status: string): vscode.ThemeIcon {
		switch (status) {
			case 'running':
				return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
			case 'error':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
			case 'disabled':
				return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('descriptionForeground'));
			case 'stopped':
				return new vscode.ThemeIcon('circle-outline');
			default:
				return new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('descriptionForeground'));
		}
	}

	private getStatusBadge(status: string): string {
		switch (status) {
			case 'running':
				return '● running';
			case 'stopped':
				return '○ stopped';
			case 'error':
				return '✕ error';
			case 'disabled':
				return '⊘ disabled';
			default:
				return '◌ unknown';
		}
	}

	private createTooltip(mcp: MCPItem): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.isTrusted = true;

		md.appendMarkdown(`**${mcp.name}**\n\n`);
		md.appendMarkdown(`Type: ${mcp.isGlobal ? 'Global' : 'Local'}\n\n`);
		
		if (mcp.description) {
			md.appendMarkdown(`${mcp.description}\n\n`);
		}
		
		md.appendMarkdown(`Command: \`${mcp.config.command}\`\n\n`);
		
		const toolCount = mcp.toolCount ?? mcp.tools?.length ?? 0;
		md.appendMarkdown(`Tools: ${toolCount}`);

		return md;
	}
}

/**
 * Enhanced data provider for card-based MCP Explorer
 */
export class MCPCardProvider implements vscode.TreeDataProvider<MCPCardTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<MCPCardTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private globalMCPs: MCPItem[] = [];
	private localMCPs: MCPItem[] = [];
	private filter: MCPFilter = 'both';
	private customGlobalPath?: string;
	private customLocalPath?: string;
	private expandedMCPs = new Set<string>();

	constructor(
		private context: vscode.ExtensionContext,
		private outputChannel: vscode.OutputChannel
	) {
		this.outputChannel.appendLine('MCPCardProvider initialized');
	}

	refresh(): void {
		this.outputChannel.appendLine('Refreshing card tree view...');
		this._onDidChangeTreeData.fire();
	}

	setFilter(filter: MCPFilter): void {
		this.outputChannel.appendLine(`Setting filter to: ${filter}`);
		this.filter = filter;
		this.refresh();
	}

	getFilter(): MCPFilter {
		return this.filter;
	}

	setCustomGlobalPath(path: string): void {
		this.customGlobalPath = path;
	}

	setCustomLocalPath(path: string): void {
		this.customLocalPath = path;
	}

	async loadMCPs(): Promise<void> {
		this.outputChannel.appendLine('\n--- Loading MCPs for Card View ---');
		
		// Load global MCPs
		const globalPath = this.customGlobalPath ?? getGlobalMCPPath();
		this.outputChannel.appendLine(`Global MCP path: ${globalPath}`);
		
		const globalFile = await readMCPFile(globalPath);
		if (globalFile) {
			this.outputChannel.appendLine(`✓ Global MCP file found with ${Object.keys(globalFile.servers).length} servers`);
		}
		this.globalMCPs = mcpFileToItems(globalFile, true);
		this.enrichMCPData(this.globalMCPs);

		// Load local MCPs
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders?.[0]) {
			const workspacePath = workspaceFolders[0].uri.fsPath;
			const localPath = this.customLocalPath ?? getLocalMCPPath(workspacePath);
			this.outputChannel.appendLine(`Local MCP path: ${localPath}`);
			
			const localFile = await readMCPFile(localPath);
			if (localFile) {
				this.outputChannel.appendLine(`✓ Local MCP file found with ${Object.keys(localFile.servers).length} servers`);
			}
			this.localMCPs = mcpFileToItems(localFile, false);
			this.enrichMCPData(this.localMCPs);
		} else {
			this.localMCPs = [];
		}

		this.outputChannel.appendLine(`Total: ${this.globalMCPs.length} global, ${this.localMCPs.length} local`);
		this.refresh();
	}

	private enrichMCPData(mcps: MCPItem[]): void {
		for (const mcp of mcps) {
			// Add sample tools for demonstration
			if (!mcp.tools) {
				const toolCount = Math.floor(Math.random() * 5) + 1;
				mcp.tools = Array.from({ length: toolCount }, (_, i) => ({
					name: `tool_${i + 1}`,
					description: `Sample tool ${i + 1} for ${mcp.name}. This is a longer description that demonstrates the ellipsis behavior when text exceeds two lines in the UI.`,
				}));
			}
			mcp.toolCount = mcp.tools.length;
			
			if (!mcp.description) {
				mcp.description = `MCP Server for ${mcp.name}`;
			}
		}
	}

	getTreeItem(element: MCPCardTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: MCPCardTreeItem): Promise<MCPCardTreeItem[]> {
		if (!element) {
			return this.getRootSections();
		}

		switch (element.itemType) {
			case 'section':
				return this.getMCPCards(element);
			case 'mcp-card':
				return this.getCardDetails(element);
			case 'tools-header':
				return this.getToolItems(element);
			case 'resources-header':
				return this.getResourceItems(element);
			default:
				return [];
		}
	}

	private getRootSections(): MCPCardTreeItem[] {
		this.outputChannel.appendLine('\ngetChildren called for root');
		this.outputChannel.appendLine(`Current filter: ${this.filter}`);

		const sections: MCPCardTreeItem[] = [];

		if (this.filter === 'both' || this.filter === 'global') {
			if (this.globalMCPs.length > 0) {
				sections.push(
					new MCPCardTreeItem(
						`Global MCPs (${this.globalMCPs.length})`,
						vscode.TreeItemCollapsibleState.Expanded,
						'section'
					)
				);
			}
		}

		if (this.filter === 'both' || this.filter === 'local') {
			if (this.localMCPs.length > 0) {
				sections.push(
					new MCPCardTreeItem(
						`Local MCPs (${this.localMCPs.length})`,
						vscode.TreeItemCollapsibleState.Expanded,
						'section'
					)
				);
			}
		}

		if (sections.length === 0) {
			const emptyItem = new vscode.TreeItem('No MCPs found');
			emptyItem.description = 'Click to locate';
			emptyItem.command = {
				command: 'mcp-lens.locateMCPFile',
				title: 'Locate MCP File',
			};
			return [emptyItem as MCPCardTreeItem];
		}

		return sections;
	}

	private getMCPCards(section: MCPCardTreeItem): MCPCardTreeItem[] {
		const isGlobal = section.label.includes('Global');
		const mcps = isGlobal ? this.globalMCPs : this.localMCPs;

		return mcps.map(
			(mcp) =>
				new MCPCardTreeItem(
					mcp.name,
					vscode.TreeItemCollapsibleState.Collapsed,
					'mcp-card',
					mcp
				)
		);
	}

	private getCardDetails(card: MCPCardTreeItem): MCPCardTreeItem[] {
		if (!card.mcpItem) return [];

		const mcp = card.mcpItem;
		const details: MCPCardTreeItem[] = [];

		// Status row with inline controls
		const status = mcp.config.disabled ? 'disabled' : (mcp.status || 'unknown');
		const statusBadge = this.getStatusBadgeText(status);
		const statusRow = new MCPCardTreeItem(
			'Status',
			vscode.TreeItemCollapsibleState.None,
			'status-row',
			undefined,
			mcp
		);
		statusRow.description = statusBadge;
		statusRow.contextValue = 'mcp-status';
		details.push(statusRow);

		// Type info with elegant icon
		const typeRow = new MCPCardTreeItem(
			mcp.isGlobal ? 'Global MCP' : 'Local MCP',
			vscode.TreeItemCollapsibleState.None,
			'info-row'
		);
		typeRow.description = mcp.config.command;
		details.push(typeRow);

		// Description if available
		if (mcp.description) {
			const descRow = new MCPCardTreeItem(
				mcp.description,
				vscode.TreeItemCollapsibleState.None,
				'info-row'
			);
			descRow.iconPath = new vscode.ThemeIcon('note', new vscode.ThemeColor('descriptionForeground'));
			details.push(descRow);
		}

		// Arguments if present
		if (mcp.config.args && mcp.config.args.length > 0) {
			const argsText = mcp.config.args.join(' ');
			const argsRow = new MCPCardTreeItem(
				'Arguments',
				vscode.TreeItemCollapsibleState.None,
				'info-row'
			);
			argsRow.description = argsText.length > 50 ? argsText.substring(0, 47) + '...' : argsText;
			argsRow.tooltip = argsText;
			details.push(argsRow);
		}

		// Environment variables if present
		if (mcp.config.env && Object.keys(mcp.config.env).length > 0) {
			const envCount = Object.keys(mcp.config.env).length;
			const envRow = new MCPCardTreeItem(
				'Environment',
				vscode.TreeItemCollapsibleState.None,
				'info-row'
			);
			envRow.description = `${envCount} variable${envCount > 1 ? 's' : ''}`;
			details.push(envRow);
		}

		// Tools section with count
		const toolCount = mcp.toolCount ?? mcp.tools?.length ?? 0;
		if (toolCount > 0) {
			const toolsHeader = new MCPCardTreeItem(
				`Tools`,
				vscode.TreeItemCollapsibleState.Collapsed,
				'tools-header',
				mcp,
				mcp
			);
			toolsHeader.description = `${toolCount} available`;
			details.push(toolsHeader);
		}

		// Resources section (placeholder for future)
		const resourceCount = 0;
		if (resourceCount > 0) {
			const resourcesHeader = new MCPCardTreeItem(
				'Resources',
				vscode.TreeItemCollapsibleState.Collapsed,
				'resources-header',
				mcp,
				mcp
			);
			resourcesHeader.description = `${resourceCount} available`;
			details.push(resourcesHeader);
		}

		return details;
	}

	private getToolItems(toolsHeader: MCPCardTreeItem): MCPCardTreeItem[] {
		if (!toolsHeader.mcpItem) return [];

		const mcp = toolsHeader.mcpItem;
		if (mcp.tools && mcp.tools.length > 0) {
			return mcp.tools.map(
				(tool) =>
					new MCPCardTreeItem(tool.name, vscode.TreeItemCollapsibleState.None, 'tool-item', mcp)
			);
		}

		// Generate placeholder tools if not available
		const toolCount = mcp.toolCount ?? 0;
		const tools: MCPCardTreeItem[] = [];
		for (let i = 1; i <= toolCount; i++) {
			tools.push(
				new MCPCardTreeItem(`tool_${i}`, vscode.TreeItemCollapsibleState.None, 'tool-item', mcp)
			);
		}
		return tools;
	}

	private getResourceItems(resourcesHeader: MCPCardTreeItem): MCPCardTreeItem[] {
		// Placeholder for future resources implementation
		return [];
	}

	getMCPByName(name: string): MCPItem | undefined {
		return [...this.localMCPs, ...this.globalMCPs].find((mcp) => mcp.name === name);
	}

	private getStatusBadgeText(status: string): string {
		switch (status) {
			case 'running':
				return '● running';
			case 'stopped':
				return '○ stopped';
			case 'error':
				return '✕ error';
			case 'disabled':
				return '⊘ disabled';
			default:
				return '◌ unknown';
		}
	}
}
