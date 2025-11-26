/**
 * MCP Control Utilities - Start, Stop, Restart MCP servers
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import { type MCPItem } from '../types';

/**
 * Map to track running MCP server processes by server name.
 */
const runningProcesses = new Map<string, ChildProcess>();

/**
 * Starts an MCP server as a child process.
 * Spawns the server using the command and arguments from the MCP configuration.
 * 
 * @param mcp - The MCP item containing configuration for the server to start
 * @param outputChannel - VS Code output channel for logging server output
 * @returns Promise resolving to true if started successfully, false otherwise
 */
export async function startMCPServer(mcp: MCPItem, outputChannel: vscode.OutputChannel): Promise<boolean> {
	try {
		outputChannel.appendLine(`\n--- Starting MCP: ${mcp.name} ---`);
		outputChannel.appendLine(`Command: ${mcp.config.command}`);
		
		if (mcp.config.args) {
			outputChannel.appendLine(`Args: ${mcp.config.args.join(' ')}`);
		}

		// Check if already running
		if (runningProcesses.has(mcp.name)) {
			vscode.window.showWarningMessage(`MCP "${mcp.name}" is already running`);
			return false;
		}

		// Spawn the process
		const childProcess = spawn(mcp.config.command, mcp.config.args ?? [], {
			env: { ...process.env, ...mcp.config.env },
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		// Track the process
		runningProcesses.set(mcp.name, childProcess);

		// Handle process output
		childProcess.stdout?.on('data', (data: Buffer) => {
			outputChannel.appendLine(`[${mcp.name}] ${data.toString()}`);
		});

		childProcess.stderr?.on('data', (data: Buffer) => {
			outputChannel.appendLine(`[${mcp.name}] ERROR: ${data.toString()}`);
		});

		childProcess.on('exit', (code: number | null) => {
			outputChannel.appendLine(`[${mcp.name}] Process exited with code ${code}`);
			runningProcesses.delete(mcp.name);
		});

		childProcess.on('error', (error: Error) => {
			outputChannel.appendLine(`[${mcp.name}] Process error: ${error.message}`);
			runningProcesses.delete(mcp.name);
		});

		vscode.window.showInformationMessage(`Started MCP: ${mcp.name}`);
		return true;
	} catch (error) {
		outputChannel.appendLine(`Failed to start MCP: ${error}`);
		vscode.window.showErrorMessage(`Failed to start MCP "${mcp.name}": ${error}`);
		return false;
	}
}

/**
 * Stops a running MCP server by sending SIGTERM to its process.
 * 
 * @param mcp - The MCP item representing the server to stop
 * @param outputChannel - VS Code output channel for logging
 * @returns Promise resolving to true if stopped successfully, false if not running
 */
export async function stopMCPServer(mcp: MCPItem, outputChannel: vscode.OutputChannel): Promise<boolean> {
	try {
		outputChannel.appendLine(`\n--- Stopping MCP: ${mcp.name} ---`);

		const childProcess = runningProcesses.get(mcp.name);
		if (!childProcess) {
			vscode.window.showWarningMessage(`MCP "${mcp.name}" is not running`);
			return false;
		}

		childProcess.kill('SIGTERM');
		runningProcesses.delete(mcp.name);

		vscode.window.showInformationMessage(`Stopped MCP: ${mcp.name}`);
		return true;
	} catch (error) {
		outputChannel.appendLine(`Failed to stop MCP: ${error}`);
		vscode.window.showErrorMessage(`Failed to stop MCP "${mcp.name}": ${error}`);
		return false;
	}
}

/**
 * Restarts an MCP server by stopping it (if running) and starting it again.
 * 
 * @param mcp - The MCP item representing the server to restart
 * @param outputChannel - VS Code output channel for logging
 * @returns Promise resolving to true if restarted successfully, false otherwise
 */
export async function restartMCPServer(mcp: MCPItem, outputChannel: vscode.OutputChannel): Promise<boolean> {
	outputChannel.appendLine(`\n--- Restarting MCP: ${mcp.name} ---`);
	
	const wasRunning = runningProcesses.has(mcp.name);
	
	if (wasRunning) {
		await stopMCPServer(mcp, outputChannel);
		// Wait a bit before restarting
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	
	return await startMCPServer(mcp, outputChannel);
}

/**
 * Gets the current status of an MCP server.
 * 
 * @param mcpName - The name of the MCP server
 * @returns 'running' if the server has an active process, 'stopped' otherwise
 */
export function getMCPStatus(mcpName: string): 'running' | 'stopped' {
	return runningProcesses.has(mcpName) ? 'running' : 'stopped';
}

/**
 * Checks if an MCP server is currently running.
 * 
 * @param mcpName - The name of the MCP server
 * @returns True if the server is running, false otherwise
 */
export function isMCPRunning(mcpName: string): boolean {
	return runningProcesses.has(mcpName);
}

/**
 * Stops all running MCP servers.
 * Called during extension deactivation to ensure clean shutdown.
 * 
 * @param outputChannel - VS Code output channel for logging
 */
export function stopAllMCPs(outputChannel: vscode.OutputChannel): void {
	outputChannel.appendLine('\n--- Stopping all MCPs ---');
	
	for (const [name, childProcess] of runningProcesses.entries()) {
		outputChannel.appendLine(`Stopping: ${name}`);
		childProcess.kill('SIGTERM');
	}
	
	runningProcesses.clear();
}
