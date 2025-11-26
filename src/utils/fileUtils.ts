/**
 * Utility functions for MCP file operations
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { type MCPFile, type MCPItem } from '../types';

/**
 * Check if a file exists
 * 
 * @param {string} filePath - The path to check
 * @returns {Promise<boolean>} True if the file exists, false otherwise
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
};

/**
 * Read and parse an MCP configuration file
 * 
 * @param {string} filePath - The path to the MCP JSON file
 * @returns {Promise<MCPFile | null>} The parsed MCP file or null if it doesn't exist or is invalid
 */
/**
 * Strip JSON comments (JSONC format support)
 * Removes single-line (//) and multi-line (/* *\/) comments
 */
const stripJsonComments = (jsonString: string): string => {
	// Remove multi-line comments
	let result = jsonString.replace(/\/\*[\s\S]*?\*\//g, '');
	
	// Remove single-line comments (but preserve strings)
	const lines = result.split('\n');
	const cleanedLines = lines.map(line => {
		// Find // that's not inside a string
		let inString = false;
		let stringChar = '';
		let commentIndex = -1;
		
		for (let i = 0; i < line.length - 1; i++) {
			const char = line[i];
			const nextChar = line[i + 1];
			
			// Toggle string state
			if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar) {
					inString = false;
					stringChar = '';
				}
			}
			
			// Find comment start outside of strings
			if (!inString && char === '/' && nextChar === '/') {
				commentIndex = i;
				break;
			}
		}
		
		return commentIndex >= 0 ? line.substring(0, commentIndex) : line;
	});
	
	return cleanedLines.join('\n');
};

export const readMCPFile = async (filePath: string): Promise<MCPFile | null> => {
	try {
		console.log(`[fileUtils] Checking file: ${filePath}`);
		const exists = await fileExists(filePath);
		if (!exists) {
			console.log(`[fileUtils] File does not exist: ${filePath}`);
			return null;
		}

		console.log(`[fileUtils] Reading file: ${filePath}`);
		const content = await fs.readFile(filePath, 'utf-8');
		console.log(`[fileUtils] File content length: ${content.length} bytes`);
		
		// Strip comments for JSONC support
		const cleanedContent = stripJsonComments(content);
		console.log(`[fileUtils] Cleaned content length: ${cleanedContent.length} bytes`);
		
		const parsed = JSON.parse(cleanedContent) as MCPFile;
		console.log(`[fileUtils] JSON parsed successfully`);
		
		// Validate the structure
		if (!parsed.servers || typeof parsed.servers !== 'object') {
			console.error(`[fileUtils] Invalid MCP file structure at ${filePath} - missing 'servers' key`);
			console.error(`[fileUtils] Found keys: ${Object.keys(parsed).join(', ')}`);
			return null;
		}

		const serverCount = Object.keys(parsed.servers).length;
		console.log(`[fileUtils] Valid MCP file with ${serverCount} servers`);
		return parsed;
	} catch (error) {
		console.error(`[fileUtils] Error reading MCP file at ${filePath}:`, error);
		return null;
	}
};

/**
 * Convert MCP configuration to MCP items
 * 
 * @param {MCPFile | null} mcpFile - The parsed MCP file
 * @param {boolean} isGlobal - Whether these are global MCPs
 * @returns {MCPItem[]} Array of MCP items
 */
export const mcpFileToItems = (mcpFile: MCPFile | null, isGlobal: boolean): MCPItem[] => {
	if (!mcpFile?.servers) {
		console.log(`[fileUtils] mcpFileToItems: No servers found (file is null or empty)`);
		return [];
	}

	const items = Object.entries(mcpFile.servers).map(([name, config]) => {
		console.log(`[fileUtils] Creating MCP item: ${name} (${isGlobal ? 'global' : 'local'})`);
		return {
			name,
			config,
			isGlobal,
			status: config.disabled ? 'stopped' : 'unknown',
		} as MCPItem;
	});
	
	console.log(`[fileUtils] Created ${items.length} MCP items`);
	return items;
};

/**
 * Extract tool information from MCP inspector output
 * This is a placeholder - actual implementation would parse inspector output
 * 
 * @param {string} mcpName - The name of the MCP
 * @returns {Promise<any>} Tool information
 */
export const getMCPTools = async (mcpName: string): Promise<any> => {
	// TODO: Implement actual MCP inspection
	// This would typically involve running the MCP and querying its capabilities
	return null;
};

/**
 * Ensure directory exists, creating it if necessary
 * 
 * @param {string} dirPath - The directory path to ensure
 * @returns {Promise<void>}
 */
export const ensureDirectory = async (dirPath: string): Promise<void> => {
	try {
		await fs.mkdir(dirPath, { recursive: true });
	} catch (error) {
		console.error(`Error creating directory ${dirPath}:`, error);
	}
};

/**
 * Write MCP file with proper formatting
 * 
 * @param {string} filePath - The path to write to
 * @param {MCPFile} content - The MCP file content
 * @returns {Promise<void>}
 */
export const writeMCPFile = async (filePath: string, content: MCPFile): Promise<void> => {
	try {
		const dirPath = path.dirname(filePath);
		await ensureDirectory(dirPath);
		await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
	} catch (error) {
		console.error(`Error writing MCP file to ${filePath}:`, error);
		throw error;
	}
};
