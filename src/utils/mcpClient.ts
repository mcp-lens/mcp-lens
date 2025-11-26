/**
 * MCP Client for JSON-RPC communication with MCP servers
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import { type MCPItem, type MCPTool } from '../types';

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number;
	result?: any;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

export class MCPClient {
	private process?: ChildProcess;
	private requestId = 0;
	private pendingRequests = new Map<number, {
		resolve: (value: any) => void;
		reject: (error: Error) => void;
	}>();
	private buffer = '';

	constructor(
		private mcp: MCPItem,
		private outputChannel: vscode.OutputChannel
	) {}

	/**
	 * Start the MCP server process
	 */
	async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const command = this.mcp.config.command;
				const args = this.mcp.config.args || [];
				const env = { ...process.env, ...this.mcp.config.env };

				this.outputChannel.appendLine(`Starting MCP server: ${command} ${args.join(' ')}`);

				this.process = spawn(command, args, {
					env,
					stdio: ['pipe', 'pipe', 'pipe'],
				});

				this.process.stdout?.setEncoding('utf8');
				this.process.stdout?.on('data', (data: string) => {
					this.handleStdout(data);
				});

				this.process.stderr?.on('data', (data: Buffer) => {
					this.outputChannel.appendLine(`[${this.mcp.name}] stderr: ${data.toString()}`);
				});

				this.process.on('error', (error: Error) => {
					this.outputChannel.appendLine(`[${this.mcp.name}] Process error: ${error.message}`);
					reject(error);
				});

				this.process.on('exit', (code: number | null) => {
					this.outputChannel.appendLine(`[${this.mcp.name}] Process exited with code ${code}`);
					this.cleanup();
				});

				// Initialize connection
				this.initialize()
					.then(() => resolve())
					.catch((error: Error) => reject(error));

			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Initialize the MCP connection
	 */
	private async initialize(): Promise<void> {
		const response = await this.sendRequest('initialize', {
			protocolVersion: '2024-11-05',
			capabilities: {
				roots: {
					listChanged: true
				},
				sampling: {}
			},
			clientInfo: {
				name: 'mcp-lens',
				version: '0.0.1'
			}
		});

		if (response.error) {
			throw new Error(`Initialize failed: ${response.error.message}`);
		}

		// Send initialized notification
		await this.sendNotification('notifications/initialized');
	}

	/**
	 * List available tools from the MCP server
	 */
	async listTools(): Promise<MCPTool[]> {
		try {
			const response = await this.sendRequest('tools/list', {});

			if (response.error) {
				throw new Error(`Failed to list tools: ${response.error.message}`);
			}

			const tools = response.result?.tools || [];
			return tools.map((tool: any) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			}));
		} catch (error) {
			this.outputChannel.appendLine(`[${this.mcp.name}] Error listing tools: ${error}`);
			return [];
		}
	}

	/**
	 * Send a JSON-RPC request
	 */
	private async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
		return new Promise((resolve, reject) => {
			if (!this.process?.stdin) {
				reject(new Error('Process not started'));
				return;
			}

			const id = ++this.requestId;
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				id,
				method,
				params,
			};

			this.pendingRequests.set(id, { resolve, reject });

			const requestStr = JSON.stringify(request) + '\n';
			this.process.stdin.write(requestStr);

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	/**
	 * Send a JSON-RPC notification (no response expected)
	 */
	private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
		if (!this.process?.stdin) {
			throw new Error('Process not started');
		}

		const notification = {
			jsonrpc: '2.0',
			method,
			params,
		};

		const notificationStr = JSON.stringify(notification) + '\n';
		this.process.stdin.write(notificationStr);
	}

	/**
	 * Handle stdout data from the MCP server
	 */
	private handleStdout(data: string): void {
		this.buffer += data;

		// Process complete JSON-RPC messages
		const lines = this.buffer.split('\n');
		this.buffer = lines.pop() || '';

		for (const line of lines) {
			if (line.trim()) {
				try {
					const response: JsonRpcResponse = JSON.parse(line);
					this.handleResponse(response);
				} catch (error) {
					this.outputChannel.appendLine(`[${this.mcp.name}] Failed to parse response: ${line}`);
				}
			}
		}
	}

	/**
	 * Handle a JSON-RPC response
	 */
	private handleResponse(response: JsonRpcResponse): void {
		if ('id' in response && typeof response.id === 'number') {
			const pending = this.pendingRequests.get(response.id);
			if (pending) {
				this.pendingRequests.delete(response.id);
				pending.resolve(response);
			}
		}
	}

	/**
	 * Stop the MCP server
	 */
	async stop(): Promise<void> {
		if (this.process) {
			this.process.kill();
			this.cleanup();
		}
	}

	/**
	 * Cleanup resources
	 */
	private cleanup(): void {
		this.pendingRequests.clear();
		this.buffer = '';
		this.process = undefined;
	}

	/**
	 * Check if the server is running
	 */
	isRunning(): boolean {
		return this.process !== undefined && !this.process.killed;
	}
}
