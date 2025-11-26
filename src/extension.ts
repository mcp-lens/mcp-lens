/**
 * MCP Lens Extension
 * An interactive VSCode tool for exploring both global and local MCPs effortlessly.
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { MCPWebviewProvider } from './providers/mcpWebviewProvider';
import { COMMANDS, VIEWS } from './constants';
import { startMCPServer, stopMCPServer, restartMCPServer, stopAllMCPs } from './utils/mcpControl';

let mcpWebviewProvider: MCPWebviewProvider | undefined;

/**
 * Activate the extension
 * 
 * @param {vscode.ExtensionContext} context - The extension context
 */
export function activate(context: vscode.ExtensionContext): void {
	const outputChannel = vscode.window.createOutputChannel('MCP Lens');
	outputChannel.show();
	outputChannel.appendLine('='.repeat(80));
	outputChannel.appendLine('MCP Lens Extension Activated!');
	outputChannel.appendLine('='.repeat(80));
	console.log('MCP Lens extension is now active!');

	// Log icon paths for debugging
	const iconPath = context.asAbsolutePath('resources/mcp-lens.png');
	const svgIconPath = context.asAbsolutePath('resources/mcp-lens.svg');
	outputChannel.appendLine(`Icon PNG path: ${iconPath}`);
	outputChannel.appendLine(`Icon SVG path: ${svgIconPath}`);
	const fs = require('fs');
	outputChannel.appendLine(`PNG exists: ${fs.existsSync(iconPath)}`);
	outputChannel.appendLine(`SVG exists: ${fs.existsSync(svgIconPath)}`);

	// Create the MCP webview provider
	outputChannel.appendLine('Creating MCP Webview Provider...');
	mcpWebviewProvider = new MCPWebviewProvider(context.extensionUri, outputChannel);

	// Register the webview view provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			MCPWebviewProvider.viewType,
			mcpWebviewProvider
		)
	);

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand(COMMANDS.REFRESH, async () => {
		outputChannel.appendLine('\n--- Refresh Command Triggered ---');
		if (mcpWebviewProvider) {
			await mcpWebviewProvider.loadMCPs();
			vscode.window.showInformationMessage('MCP list refreshed');
		}
	});

	// Locate MCP file command
	const locateMCPFileCommand = vscode.commands.registerCommand(
		COMMANDS.LOCATE_MCP_FILE,
		async () => {
			outputChannel.appendLine('\n--- Locate MCP File Command Triggered ---');
			vscode.window.showInformationMessage('MCP file location feature coming soon');
		}
	);

	// MCP control commands (handled by webview now)

	// Add all commands to subscriptions
	context.subscriptions.push(
		refreshCommand,
		locateMCPFileCommand
	);

	// Initial load
	outputChannel.appendLine('\n--- Initial MCP Load ---');
	if (mcpWebviewProvider) {
		mcpWebviewProvider.loadMCPs().then(() => {
			outputChannel.appendLine('Initial load completed');
		}).catch((err: unknown) => {
			outputChannel.appendLine(`Initial load error: ${err}`);
		});
	}
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
	// Cleanup MCP clients
	if (mcpWebviewProvider) {
		await mcpWebviewProvider.dispose();
	}
	
	// Stop all running MCPs
	const outputChannel = vscode.window.createOutputChannel('MCP Lens');
	await stopAllMCPs(outputChannel);
}
