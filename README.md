# Arabic Translation Editor

A sophisticated tri-view translation editor for Arabic texts with MCP (Model Context Protocol) integration and GitHub CLI workflow.

## Features

- **Tri-View Interface**: Arabic-Original, Arabic-Enhanced, and English translation columns
- **MCP Integration**: Enhanced translation capabilities via web-to-mcp server
- **Quality Assessment**: LPR (Length Preservation Ratio) and quality gates
- **Scripture Verification**: Quran and Hadith reference validation
- **GitHub CLI Integration**: Complete workflow management from terminal

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Visit: http://localhost:3000/tri

### 3. Run Translation Pipeline
```bash
# Standard pipeline
npm run orchestrate

# MCP-enhanced pipeline
npm run orchestrate:mcp
```

## GitHub CLI Integration

This project includes comprehensive GitHub CLI integration for streamlined development workflow.

### Setup GitHub CLI

1. **Install GitHub CLI** (if not already installed):
   ```bash
   brew install gh
   ```

2. **Authenticate with GitHub**:
   ```bash
   npm run github:auth
   ```

3. **Setup GitHub Repository**:
   ```bash
   npm run github:setup
   ```

### Available GitHub Commands

- `npm run github:auth` - Authenticate with GitHub
- `npm run github:issues` - List all issues
- `npm run github:pr` - Create a pull request
- `gh pr status` - Check pull request status
- `gh repo view` - View repository information

### GitHub Workflow Features

- **Automated Repository Creation**: Sets up GitHub repository with proper configuration
- **Issue Templates**: Pre-configured issues for common development tasks
- **Pull Request Templates**: Standardized PR templates for code review
- **Quality Gates**: Automated quality validation before merging

## Translation Pipeline

### Standard Pipeline
```bash
npm run orchestrate
```

### MCP-Enhanced Pipeline
```bash
npm run orchestrate:mcp
```

### Scale to Full Document
```bash
npm run scale:full
```

### Quality Validation
```bash
npm run validate:quality
```

## Project Structure

```
├── app/                    # Next.js application
│   ├── api/               # API routes
│   │   └── mcp/          # MCP integration endpoints
│   └── tri/              # Main translation interface
├── lib/                   # Core libraries
│   ├── mcp/              # MCP client and services
│   ├── complexity.ts     # LPR calculations
│   └── guards.ts         # Quality gates
├── orchestrate/           # Pipeline orchestration
│   ├── pipeline.mjs      # Standard pipeline
│   └── mcp-pipeline.mjs  # MCP-enhanced pipeline
├── scripts/              # Utility scripts
│   ├── github-workflow.mjs
│   ├── scale-to-full.mjs
│   └── quality-validation.mjs
└── outputs/              # Generated outputs
    ├── triview.json      # Standard results
    ├── triview-mcp.json  # MCP-enhanced results
    └── tmp/rows/         # Individual row data
```

## MCP Integration

The project integrates with web-to-mcp server for enhanced translation capabilities:

- **URL**: `https://web-to-mcp.com/mcp/657946f0-c4c4-482d-892b-9d93597c67e7/`
- **API Endpoint**: `http://localhost:3000/api/mcp/translate`
- **Fallback Mode**: Automatic fallback when MCP server unavailable

## Quality Metrics

- **LPR (Length Preservation Ratio)**: Target ≥ 1.05, Minimum ≥ 0.95
- **Coverage**: 100% semantic coverage required
- **Scripture Verification**: All references must resolve
- **Confidence Scoring**: Translation confidence assessment

## Development Workflow

1. **Make Changes**: Edit code in your preferred editor
2. **Test Locally**: Run `npm run dev` and test at http://localhost:3000/tri
3. **Run Pipeline**: Execute `npm run orchestrate:mcp` for translation processing
4. **Validate Quality**: Run `npm run validate:quality` to check metrics
5. **Create PR**: Use `npm run github:pr` to create pull request
6. **Review**: Use `gh pr status` to check review status

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run quality validation: `npm run validate:quality`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Create a Pull Request: `npm run github:pr`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [GitHub CLI](https://cli.github.com/) for terminal-based workflow management
- [Model Context Protocol](https://modelcontextprotocol.io/) for enhanced AI capabilities
- Next.js and React for the web interface
- Tailwind CSS for styling
