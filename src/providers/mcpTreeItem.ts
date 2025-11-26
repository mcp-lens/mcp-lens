/**
 * Tree item classes for MCP Explorer
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { type MCPItem, type TreeItemType } from '../types';

/**
 * Tree item for MCP Explorer
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
		if (!this.mcpItem) {
			return;
		}

		const mcp = this.mcpItem;
		const status = mcp.config.disabled ? 'disabled' : (mcp.status || 'unknown');

		this.iconPath = this.getStatusIcon(status);
		this.description = this.getStatusBadge(status);
		this.tooltip = this.createTooltip(mcp);
	}

	private setupInfoRow(): void {
		this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('descriptionForeground'));
	}

	private setupStatusRow(): void {
		if (!this.parentMcp) {
			return;
		}
		this.iconPath = new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.blue'));
	}

	private setupToolsHeader(): void {
		this.iconPath = new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.orange'));
	}

	private setupToolItem(): void {
		this.iconPath = new vscode.ThemeIcon(
			'symbol-method',
			new vscode.ThemeColor('symbolIcon.methodForeground')
		);
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
				return new vscode.ThemeIcon(
					'circle-large-outline',
					new vscode.ThemeColor('descriptionForeground')
				);
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

		md.appendMarkdown(`**${mcp.name}**\\n\\n`);
		md.appendMarkdown(`Type: ${mcp.isGlobal ? 'Global' : 'Local'}\\n\\n`);

		if (mcp.description) {
			md.appendMarkdown(`${mcp.description}\\n\\n`);
		}

		md.appendMarkdown(`Command: \`${mcp.config.command}\`\\n\\n`);

		const toolCount = mcp.toolCount ?? mcp.tools?.length ?? 0;
		md.appendMarkdown(`Tools: ${toolCount}`);

		return md;
	}
}
