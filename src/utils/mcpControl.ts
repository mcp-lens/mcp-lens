/**
 * MCP Control Utilities - Start, Stop, Restart MCP servers
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import { type MCPItem } from '../types';

/**
 * Map to track running MCP processes
 */
const runningProcesses = new Map<string, ChildProcess>();

/**
 * Start an MCP server
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
 * Stop an MCP server
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
 * Restart an MCP server
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
 * Get MCP server status
 */
export function getMCPStatus(mcpName: string): 'running' | 'stopped' {
	return runningProcesses.has(mcpName) ? 'running' : 'stopped';
}

/**
 * Check if MCP is running
 */
export function isMCPRunning(mcpName: string): boolean {
	return runningProcesses.has(mcpName);
}

/**
 * Stop all running MCP servers
 */
export function stopAllMCPs(outputChannel: vscode.OutputChannel): void {
	outputChannel.appendLine('\n--- Stopping all MCPs ---');
	
	for (const [name, childProcess] of runningProcesses.entries()) {
		outputChannel.appendLine(`Stopping: ${name}`);
		childProcess.kill('SIGTERM');
	}
	
	runningProcesses.clear();
}
