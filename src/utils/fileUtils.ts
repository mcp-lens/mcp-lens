/**
 * Utility functions for MCP file operations
 * 
 * @author Giri Jeedigunta <giri.jeedigunta@gmail.com>
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { type MCPFile, type MCPItem } from '../types';

/**
 * Checks if a file exists at the specified path.
 * 
 * @param filePath - The absolute path to the file to check
 * @returns Promise resolving to true if the file exists, false otherwise
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
 * Strips JSON comments from a string to support JSONC format.
 * Removes both single-line (//) and multi-line (/* *\/) comments while preserving strings.
 * 
 * @param jsonString - The JSON string with potential comments
 * @returns The cleaned JSON string without comments
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

/**
 * Reads and parses an MCP configuration file from disk.
 * Supports JSONC format (JSON with comments) and validates the structure.
 * 
 * @param filePath - The absolute path to the MCP JSON configuration file
 * @returns Promise resolving to the parsed MCP file or null if it doesn't exist or is invalid
 */
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
 * Converts MCP configuration data into MCP item instances.
 * Transforms the raw configuration into runtime-ready objects with metadata.
 * 
 * @param mcpFile - The parsed MCP configuration file, or null if unavailable
 * @param isGlobal - Whether these MCPs are from global or workspace configuration
 * @returns Array of MCP items ready for display and interaction
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
 * Ensures a directory exists, creating it recursively if necessary.
 * 
 * @param dirPath - The absolute path to the directory to ensure
 */
export const ensureDirectory = async (dirPath: string): Promise<void> => {
	try {
		await fs.mkdir(dirPath, { recursive: true });
	} catch (error) {
		console.error(`Error creating directory ${dirPath}:`, error);
	}
};

/**
 * Writes an MCP configuration file to disk with proper JSON formatting.
 * Creates parent directories if they don't exist.
 * 
 * @param filePath - The absolute path where the file should be written
 * @param content - The MCP configuration content to write
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
