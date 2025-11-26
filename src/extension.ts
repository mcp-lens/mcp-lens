/**
 * MCP Lens Extension
 * An interactive VSCode tool for exploring both global and local MCPs effortlessly.
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { MCPLensWebviewProvider } from './providers/mcpWebviewProvider';
import { COMMANDS } from './constants';

let mcpLensWebviewProvider: MCPLensWebviewProvider | undefined;

/**
 * Activates the MCP Lens extension.
 * Initializes the webview provider, registers commands, and performs initial MCP discovery.
 * 
 * @param context - The VS Code extension context providing access to extension resources and subscriptions
 */
export function activate(context: vscode.ExtensionContext): void {
	const outputChannel = vscode.window.createOutputChannel('MCP Lens');
	mcpLensWebviewProvider = new MCPLensWebviewProvider(context.extensionUri, outputChannel);

	// Register the webview view provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			MCPLensWebviewProvider.viewType,
			mcpLensWebviewProvider
		)
	);

	// Register refresh command to reload MCP configurations
	const refreshCommand = vscode.commands.registerCommand(COMMANDS.REFRESH, async () => {
		if (mcpLensWebviewProvider) {
			await mcpLensWebviewProvider.loadMCPs();
			vscode.window.showInformationMessage('MCP list refreshed');
		}
	});

	// Register locate MCP file command
	const locateMCPFileCommand = vscode.commands.registerCommand(
		COMMANDS.LOCATE_MCP_FILE,
		async () => {
			vscode.window.showInformationMessage('MCP file location feature coming soon');
		}
	);

	// Add all commands to subscriptions
	context.subscriptions.push(
		refreshCommand,
		locateMCPFileCommand
	);

	// Initial load of MCP servers
	if (mcpLensWebviewProvider) {
		mcpLensWebviewProvider.loadMCPs().catch((err: unknown) => {
			outputChannel.appendLine(`Error loading MCPs: ${err}`);
		});
	}
}

/**
 * Deactivates the MCP Lens extension.
 * Performs cleanup by disposing of the webview provider and terminating all active MCP server connections.
 */
export async function deactivate(): Promise<void> {
	if (mcpLensWebviewProvider) {
		await mcpLensWebviewProvider.dispose();
	}
}
