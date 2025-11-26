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
5. Commit with clear messages using [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat: add new feature` - New features
   - `fix: resolve bug in server discovery` - Bug fixes
   - `docs: update README` - Documentation changes
   - `style: format code` - Code style changes
   - `refactor: restructure utils` - Code refactoring
   - `test: add unit tests` - Test additions
   - `chore: update dependencies` - Maintenance tasks
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request with a descriptive title following the same convention

### Code Style

- Follow the existing TypeScript code style
- Use ESLint for linting (`npm run lint`)
- Write clear commit messages following [Conventional Commits](https://www.conventionalcommits.org/)
- Add comments for complex logic
- Ensure code compiles without errors (`npm run compile`)

### Commit Message Format

We follow the Conventional Commits specification for clear and structured commit history:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting (no functional changes)
- `refactor`: Code restructuring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependencies, etc.

**Examples:**
```bash
feat: add support for SSE transport
fix: resolve icon rendering in dark theme
docs: update installation instructions
refactor: extract MCP client logic into separate module
```

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
