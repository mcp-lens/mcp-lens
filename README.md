# MCP Lens

**MCP Lens** is an interactive Visual Studio Code extension that provides a beautiful, intuitive interface for exploring and managing both global and local Model Context Protocol (MCP) servers.

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/giri-jeedigunta/mcp-lens)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

> **✨ Essential for GitHub Copilot & VS Code Copilot Users**
> 
> If you're an avid Copilot user working with Model Context Protocol (MCP) servers, this extension is a must-have for managing and monitoring your MCP configurations.

---

## Why MCP Lens?

As MCP servers become integral to AI-powered development workflows, managing multiple configurations can be challenging. MCP Lens provides:

- **Visual Management**: See all your MCP servers (global and workspace-specific) in one elegant view
- **Real-Time Monitoring**: Watch servers start, monitor tool counts, and track status changes live
- **Easy Configuration**: Quick access to edit your `mcp.json` files with proper validation
- **Developer-Friendly**: Built by developers, for developers who work with Copilot and MCP daily

## Features

- 🌍 **Automatic Discovery**: Detects MCP configurations from global VS Code settings and workspace `mcp.json` files
- 🔍 **Beautiful Interface**: Clean, card-based UI with real-time status indicators and tool information
- ⚡ **Server Control**: Start, stop, and restart MCP servers with one click
- 📊 **Live Updates**: See tool counts and status changes as servers load
- 🎯 **Smart Filtering**: Toggle between global MCPs, workspace MCPs, or view both
- 🔧 **Quick Configuration**: Direct links to edit your MCP configuration files
- 🎨 **Theme-Aware**: Adapts seamlessly to your VS Code theme

## Installation

Search for "MCP Lens" in the VS Code Extensions marketplace and click Install.

## Quick Start

1. **Open MCP Lens**: Click the MCP Lens icon in the Activity Bar (left sidebar)
2. **View Your Servers**: The extension automatically discovers:
   - **Global MCPs**: From your VS Code user `mcp.json`
   - **Workspace MCPs**: From `mcp.json` in your project root
3. **Manage Servers**: Use the play/stop/restart buttons to control servers
4. **Configure**: Click "Configure" links to edit your MCP configuration files

## MCP Configuration

MCP Lens reads configurations from:

- **Global**: `~/Library/Application Support/Code/User/mcp.json` (macOS)
- **Workspace**: `mcp.json` in your project root (recommended for project-specific servers)

### Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

**Learn More**:
- [VS Code MCP Documentation](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [MCP Configuration Format](https://code.visualstudio.com/docs/copilot/customization/mcp-servers#_configuration-format)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)

## MCP Configuration Format

MCP configuration files follow this structure:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"],
      "env": {
        "API_KEY": "your-key"
      },
      "disabled": false,
      "alwaysAllow": ["tool1", "tool2"]
    }
  }
}
```

See the `examples/` directory for sample configurations.

## Requirements

- Visual Studio Code 1.106.1 or higher
- Node.js (for running MCP servers)

## Inspiration

MCP Lens draws inspiration from excellent tools like [Cline](https://github.com/cline/cline) and other AI-powered development extensions, focusing on making MCP server management accessible and elegant.

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/giri-jeedigunta/mcp-lens.git
cd mcp-lens

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run in development mode
npm run watch

# Press F5 in VS Code to launch extension host
```

## Contributing

Contributions are welcome! Please see our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md).

**Quick Start:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Giri Jeedigunta**
- GitHub: [@giri-jeedigunta](https://github.com/giri-jeedigunta)
- Email: giri.jeedigunta@gmail.com

---

**Enjoy seamless MCP management with MCP Lens!** 🚀
