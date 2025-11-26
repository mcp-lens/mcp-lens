/**
 * MCP Client for JSON-RPC communication with MCP servers
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import { type MCPItem, type MCPTool } from '../types';

/**
 * JSON-RPC 2.0 request structure for MCP communication.
 */
interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: number;
	method: string;
	params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response structure from MCP servers.
 */
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

/**
 * Client for communicating with MCP servers via JSON-RPC 2.0 over stdio.
 * Manages the server process lifecycle and handles bidirectional communication.
 */
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
	 * Starts the MCP server process and initializes the JSON-RPC connection.
	 * Spawns the server as a child process and performs the MCP initialization handshake.
	 * 
	 * @throws Error if the server fails to start or initialize
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
	 * Initializes the MCP connection by sending the initialize request.
	 * Establishes protocol version and client capabilities with the server.
	 * 
	 * @throws Error if initialization fails
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
	 * Retrieves the list of available tools from the connected MCP server.
	 * 
	 * @returns Promise resolving to an array of tool definitions
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
	 * Sends a JSON-RPC request to the MCP server and waits for a response.
	 * Implements a 10-second timeout for request completion.
	 * 
	 * @param method - The JSON-RPC method name to invoke
	 * @param params - Optional parameters for the method
	 * @returns Promise resolving to the JSON-RPC response
	 * @throws Error if the request times out or the process is not started
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
	 * Sends a JSON-RPC notification to the MCP server (no response expected).
	 * 
	 * @param method - The notification method name
	 * @param params - Optional parameters for the notification
	 * @throws Error if the process is not started
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
	 * Handles stdout data from the MCP server.
	 * Buffers incoming data and processes complete JSON-RPC messages line by line.
	 * 
	 * @param data - Raw stdout data from the server process
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
	 * Handles a JSON-RPC response by resolving the corresponding pending request.
	 * 
	 * @param response - The JSON-RPC response from the server
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
	 * Stops the MCP server by terminating its process.
	 */
	async stop(): Promise<void> {
		if (this.process) {
			this.process.kill();
			this.cleanup();
		}
	}

	/**
	 * Cleans up client resources by clearing pending requests and resetting state.
	 */
	private cleanup(): void {
		this.pendingRequests.clear();
		this.buffer = '';
		this.process = undefined;
	}

	/**
	 * Checks if the MCP server process is currently running.
	 * 
	 * @returns True if the server is running, false otherwise
	 */
	isRunning(): boolean {
		return this.process !== undefined && !this.process.killed;
	}
}
