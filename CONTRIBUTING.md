# Contributing to MCP Lens

Thank you for your interest in contributing to MCP Lens! We welcome contributions from the community.

## How to Contribute

### Reporting Issues

- Use GitHub Issues to report bugs or suggest features
- Include VS Code version, OS, and steps to reproduce
- Attach screenshots if reporting UI issues

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following our code style
4. Test thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Follow the existing TypeScript code style
- Use ESLint for linting (`npm run lint`)
- Write clear commit messages
- Add comments for complex logic
- Ensure code compiles without errors (`npm run compile`)

### Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the CHANGELOG.md with a note describing your changes
3. Ensure all tests pass and the extension compiles without errors
4. Request review from maintainers
5. Address any feedback promptly

## Development Setup

```bash
# Clone the repository
git clone https://github.com/giri-jeedigunta/mcp-lens.git
cd mcp-lens

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run in watch mode
npm run watch

# Press F5 in VS Code to launch extension host
```

## Questions?

Feel free to open an issue for any questions or discussions about contributing.
