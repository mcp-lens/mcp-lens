/**
 * MCP Lens Extension
 * An interactive VSCode tool for exploring both global and local MCPs effortlessly.
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { MCPWebviewProvider } from './providers/mcpWebviewProvider';
import { COMMANDS } from './constants';

let mcpWebviewProvider: MCPWebviewProvider | undefined;

/**
 * Activates the MCP Lens extension.
 * Initializes the webview provider, registers commands, and performs initial MCP discovery.
 * 
 * @param context - The VS Code extension context providing access to extension resources and subscriptions
 */
export function activate(context: vscode.ExtensionContext): void {
	const outputChannel = vscode.window.createOutputChannel('MCP Lens');
	outputChannel.show();
	outputChannel.appendLine('='.repeat(80));
	outputChannel.appendLine('MCP Lens Extension Activated!');
	outputChannel.appendLine('='.repeat(80));

	outputChannel.appendLine('Creating MCP Webview Provider...');
	mcpWebviewProvider = new MCPWebviewProvider(context.extensionUri, outputChannel);

	// Register the webview view provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			MCPWebviewProvider.viewType,
			mcpWebviewProvider
		)
	);

	// Register refresh command to reload MCP configurations
	const refreshCommand = vscode.commands.registerCommand(COMMANDS.REFRESH, async () => {
		outputChannel.appendLine('\n--- Refresh Command Triggered ---');
		if (mcpWebviewProvider) {
			await mcpWebviewProvider.loadMCPs();
			vscode.window.showInformationMessage('MCP list refreshed');
		}
	});

	// Register locate MCP file command
	const locateMCPFileCommand = vscode.commands.registerCommand(
		COMMANDS.LOCATE_MCP_FILE,
		async () => {
			outputChannel.appendLine('\n--- Locate MCP File Command Triggered ---');
			vscode.window.showInformationMessage('MCP file location feature coming soon');
		}
	);

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
 * Deactivates the MCP Lens extension.
 * Performs cleanup by disposing of the webview provider and stopping all active MCP clients.
 */
export async function deactivate(): Promise<void> {
	if (mcpWebviewProvider) {
		await mcpWebviewProvider.dispose();
	}
}
