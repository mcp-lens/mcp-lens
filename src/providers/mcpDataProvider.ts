/**
 * Tree data provider for MCP Explorer view
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { type MCPItem, type MCPFilter } from '../types';
import { getGlobalMCPPath, getLocalMCPPath } from '../constants';
import { readMCPFile, mcpFileToItems } from '../utils/fileUtils';

/**
 * Represents a tree item in the MCP Explorer
 */
export class MCPTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly mcpItem?: MCPItem,
		public readonly isSection?: boolean
	) {
		super(label, collapsibleState);

		if (mcpItem) {
			this.tooltip = this.createTooltip(mcpItem);
			this.description = this.createDescription(mcpItem);
			this.contextValue = 'mcpItem';
			this.iconPath = this.getIcon(mcpItem);
		} else if (isSection) {
			this.contextValue = 'mcpSection';
			this.iconPath = new vscode.ThemeIcon(label.includes('Global') ? 'globe' : 'folder');
		}
	}

	/**
	 * Create tooltip text for MCP item
	 */
	private createTooltip(mcp: MCPItem): string {
		const parts = [
			`Name: ${mcp.name}`,
			`Type: ${mcp.isGlobal ? 'Global' : 'Local'}`,
			`Command: ${mcp.config.command}`,
		];

		if (mcp.config.args?.length) {
			parts.push(`Args: ${mcp.config.args.join(' ')}`);
		}

		if (mcp.status) {
			parts.push(`Status: ${mcp.status}`);
		}

		if (mcp.config.disabled) {
			parts.push('Disabled: Yes');
		}

		return parts.join('\n');
	}

	/**
	 * Create description text for MCP item
	 */
	private createDescription(mcp: MCPItem): string {
		const parts: string[] = [];

		if (mcp.config.disabled) {
			parts.push('disabled');
		} else if (mcp.status) {
			parts.push(mcp.status);
		}

		return parts.join(' • ');
	}

	/**
	 * Get icon for MCP item based on status
	 */
	private getIcon(mcp: MCPItem): vscode.ThemeIcon {
		if (mcp.config.disabled) {
			return new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('errorForeground'));
		}

		switch (mcp.status) {
			case 'running':
				return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
			case 'error':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
			case 'stopped':
				return new vscode.ThemeIcon('debug-stop');
			default:
				return new vscode.ThemeIcon('symbol-misc');
		}
	}
}

/**
 * Data provider for MCP Explorer tree view
 */
export class MCPDataProvider implements vscode.TreeDataProvider<MCPTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<MCPTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private globalMCPs: MCPItem[] = [];
	private localMCPs: MCPItem[] = [];
	private filter: MCPFilter = 'both';
	private customGlobalPath?: string;
	private customLocalPath?: string;

	constructor(
		private context: vscode.ExtensionContext,
		private outputChannel: vscode.OutputChannel
	) {
		this.outputChannel.appendLine('MCPDataProvider initialized');
	}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this.outputChannel.appendLine('Refreshing tree view...');
		this._onDidChangeTreeData.fire();
	}

	/**
	 * Set filter for MCP view
	 */
	setFilter(filter: MCPFilter): void {
		this.outputChannel.appendLine(`Setting filter to: ${filter}`);
		this.filter = filter;
		this.refresh();
	}

	/**
	 * Get current filter
	 */
	getFilter(): MCPFilter {
		return this.filter;
	}

	/**
	 * Set custom global MCP path
	 */
	setCustomGlobalPath(path: string): void {
		this.customGlobalPath = path;
	}

	/**
	 * Set custom local MCP path
	 */
	setCustomLocalPath(path: string): void {
		this.customLocalPath = path;
	}

	/**
	 * Load MCP data from files
	 */
	async loadMCPs(): Promise<void> {
		this.outputChannel.appendLine('\n--- Loading MCPs ---');
		
		// Load global MCPs
		const globalPath = this.customGlobalPath ?? getGlobalMCPPath();
		this.outputChannel.appendLine(`Global MCP path: ${globalPath}`);
		
		const globalFile = await readMCPFile(globalPath);
		if (globalFile) {
			this.outputChannel.appendLine(`✓ Global MCP file found with ${Object.keys(globalFile.servers).length} servers`);
		} else {
			this.outputChannel.appendLine('✗ Global MCP file not found or invalid');
		}
		this.globalMCPs = mcpFileToItems(globalFile, true);
		this.outputChannel.appendLine(`Global MCPs loaded: ${this.globalMCPs.length}`);

		// Load local MCPs if workspace is available
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders?.[0]) {
			const workspacePath = workspaceFolders[0].uri.fsPath;
			this.outputChannel.appendLine(`Workspace found: ${workspacePath}`);
			
			const localPath = this.customLocalPath ?? getLocalMCPPath(workspacePath);
			this.outputChannel.appendLine(`Local MCP path: ${localPath}`);
			
			const localFile = await readMCPFile(localPath);
			if (localFile) {
				this.outputChannel.appendLine(`✓ Local MCP file found with ${Object.keys(localFile.servers).length} servers`);
			} else {
				this.outputChannel.appendLine('✗ Local MCP file not found or invalid');
			}
			this.localMCPs = mcpFileToItems(localFile, false);
			this.outputChannel.appendLine(`Local MCPs loaded: ${this.localMCPs.length}`);
		} else {
			this.outputChannel.appendLine('No workspace folder found');
			this.localMCPs = [];
		}

		this.outputChannel.appendLine(`Total: ${this.globalMCPs.length} global, ${this.localMCPs.length} local`);
		this.outputChannel.appendLine('Triggering tree refresh...');
		this.refresh();
	}

	/**
	 * Get tree item
	 */
	getTreeItem(element: MCPTreeItem): vscode.TreeItem {
		return element;
	}

	/**
	 * Get children for tree view
	 */
	async getChildren(element?: MCPTreeItem): Promise<MCPTreeItem[]> {
		if (!element) {
			this.outputChannel.appendLine('\ngetChildren called for root');
			// Root level - return sections based on filter
			// Note: Don't call loadMCPs here as it causes infinite loop
			// Data should already be loaded from activate

			this.outputChannel.appendLine(`Current filter: ${this.filter}`);
			this.outputChannel.appendLine(`Available: ${this.localMCPs.length} local, ${this.globalMCPs.length} global`);

			const sections: MCPTreeItem[] = [];

			if (this.filter === 'both' || this.filter === 'local') {
				if (this.localMCPs.length > 0) {
					sections.push(
						new MCPTreeItem(
							`Local MCPs (${this.localMCPs.length})`,
							vscode.TreeItemCollapsibleState.Expanded,
							undefined,
							true
						)
					);
				}
			}

			if (this.filter === 'both' || this.filter === 'global') {
				if (this.globalMCPs.length > 0) {
					sections.push(
						new MCPTreeItem(
							`Global MCPs (${this.globalMCPs.length})`,
							vscode.TreeItemCollapsibleState.Expanded,
							undefined,
							true
						)
					);
				}
			}

			if (sections.length === 0) {
				this.outputChannel.appendLine('No MCP sections to display - showing empty state');
				const emptyItem = new vscode.TreeItem('No MCPs found');
				emptyItem.description = 'Click to locate MCP file';
				emptyItem.command = {
					command: 'mcp-lens.locateMCPFile',
					title: 'Locate MCP File',
				};
				return [emptyItem as MCPTreeItem];
			}

			this.outputChannel.appendLine(`Returning ${sections.length} sections`);
			return sections;
		} else if (element.isSection) {
			// Section level - return MCP items
			const isGlobal = element.label.includes('Global');
			const mcps = isGlobal ? this.globalMCPs : this.localMCPs;
			this.outputChannel.appendLine(`Expanding ${isGlobal ? 'Global' : 'Local'} section with ${mcps.length} items`);
			
			const items = mcps.map((mcp) => {
				this.outputChannel.appendLine(`  - ${mcp.name} (${mcp.config.command})`);
				return new MCPTreeItem(
					mcp.name,
					vscode.TreeItemCollapsibleState.None,
					mcp
				);
			});
			
			return items;
		}

		this.outputChannel.appendLine('getChildren called with unknown element');
		return [];
	}

	/**
	 * Get MCP item by name
	 */
	getMCPByName(name: string): MCPItem | undefined {
		return [...this.localMCPs, ...this.globalMCPs].find((mcp) => mcp.name === name);
	}
}
