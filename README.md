# Arabic Translation Editor

A sophisticated tri-view translation editor for Arabic texts with MCP (Model Context Protocol) integration, GitHub CLI workflow, and intelligent development tools powered by Console Ninja and Nx Console.

## Features

- **Tri-View Interface**: Arabic-Original, Arabic-Enhanced, and English translation columns
- **MCP Integration**: Enhanced translation capabilities via web-to-mcp server
- **Quality Assessment**: LPR (Length Preservation Ratio) and quality gates
- **Scripture Verification**: Quran and Hadith reference validation
- **GitHub CLI Integration**: Complete workflow management from terminal
- **Console Ninja Integration**: Enhanced debugging and structured logging
- **Nx Console Integration**: Intelligent code generation and auto-fixing
- **Self-Healing System**: Automatic platform monitoring and issue resolution
- **Intelligent Auto-Fixing**: Automated code quality improvements

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
# Basic development server
npm run dev

# Development with monitoring and auto-fixing
npm run dev:full

# Development with Console Ninja monitoring
npm run dev:monitored
```
Visit: http://localhost:3000/tri

### 3. Run Translation Pipeline
```bash
# Standard pipeline
npm run orchestrate

# MCP-enhanced pipeline
npm run orchestrate:mcp
```

### 4. Enable Intelligent Development Tools
```bash
# Start self-healing monitoring
npm run monitor:start

# Run intelligent auto-fixing
npm run fix:all

# Test Console Ninja integration
npm run console:ninja
```

## Console Ninja & Nx Console Integration

This project features advanced development tools integration for enhanced debugging, intelligent code generation, and self-sustaining platform capabilities.

### Console Ninja Integration

Console Ninja provides enhanced debugging and structured logging capabilities:

#### Features
- **Structured Logging**: Rich, contextual logging with timestamps and metadata
- **Domain-Specific Loggers**: Custom loggers for assistant, translation, quality, and audio
- **Performance Monitoring**: Real-time performance tracking and memory usage
- **Error Tracking**: Comprehensive error logging with stack traces
- **Persistent Logs**: Logs persist across sessions for better debugging

#### Usage
```typescript
import { logger } from './lib/logging/console-ninja';

// Basic logging
logger.info('User logged in', { userId: '123' });
logger.error('API call failed', { error: error.message });

// Domain-specific logging
logger.assistant('Claude response generated', { tokens: 150 });
logger.translation('Text translated', { source: 'ar', target: 'en' });
logger.quality('Quality check passed', { score: 0.95 });
logger.audio('Audio generated', { duration: 30 });

// Performance monitoring
logger.performance('Database query', 250, { query: 'SELECT * FROM users' });

// Error tracking
logger.trackError(error, { context: 'user-action' });
```

### Nx Console Integration

Nx Console provides intelligent code generation and auto-fixing capabilities:

#### Features
- **Intelligent Code Generation**: Automated code generation for components and services
- **Auto-Fixing System**: Intelligent fixing of TypeScript, React, and Next.js issues
- **Code Quality**: Automated code quality improvements and best practices
- **Dependency Management**: Smart dependency resolution and updates

#### Available Commands
```bash
# Nx Console commands
npm run nx:generate    # Generate code with Nx
npm run nx:run         # Run Nx commands
npm run nx:build       # Build with Nx
npm run nx:test        # Test with Nx
npm run nx:lint        # Lint with Nx
```

### Self-Healing System

The platform includes a comprehensive self-healing system that monitors and automatically fixes issues:

#### Health Checks
- **Database Connectivity**: Monitors data directory access
- **API Endpoints**: Checks API endpoint health
- **Memory Usage**: Monitors memory consumption
- **File System Permissions**: Validates file system access
- **TypeScript Compilation**: Checks for compilation errors

#### Auto-Fixing Rules
- **Import Fixes**: Missing React imports, incorrect import paths
- **TypeScript Fixes**: Missing type annotations, interface exports
- **React Fixes**: Missing use client directives, performance optimizations
- **Next.js Fixes**: API route structure, middleware configuration
- **Accessibility Fixes**: Missing ARIA labels, accessibility improvements

#### Monitoring Commands
```bash
# Start monitoring
npm run monitor:start

# Stop monitoring
npm run monitor:stop

# Run health checks
npm run monitor:health

# Enable intelligent fixer
npm run fix:intelligent

# Run all fixes
npm run fix:all
```

### VS Code Configuration

The project includes pre-configured VS Code settings for optimal development experience:

#### Extensions
- **Console Ninja**: `console-ninja.console-ninja`
- **Nx Console**: `nrwl.angular-console`
- **Additional Tools**: ESLint, Prettier, TypeScript, Tailwind CSS

#### Features
- **Auto-save**: Automatic file saving with 1-second delay
- **Format on Save**: Automatic code formatting
- **IntelliSense**: Enhanced code completion and suggestions
- **Debugging**: Pre-configured debug configurations
- **Tasks**: Automated development tasks

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
│   │   ├── mcp/          # MCP integration endpoints
│   │   ├── assistant/    # AI assistant endpoints
│   │   └── audio/        # Audio generation endpoints
│   ├── (components)/     # React components
│   └── tri/              # Main translation interface
├── lib/                   # Core libraries
│   ├── mcp/              # MCP client and services
│   ├── logging/          # Console Ninja integration
│   │   └── console-ninja.ts
│   ├── auto-fix/         # Intelligent auto-fixing
│   │   └── intelligent-fixer.ts
│   ├── monitoring/       # Self-healing system
│   │   └── self-healing.ts
│   ├── complexity.ts     # LPR calculations
│   └── guards.ts         # Quality gates
├── .vscode/              # VS Code configuration
│   ├── settings.json     # Extension settings
│   ├── extensions.json   # Recommended extensions
│   ├── tasks.json        # Development tasks
│   └── launch.json       # Debug configurations
├── orchestrate/           # Pipeline orchestration
│   ├── pipeline.ts       # Standard pipeline
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

## Available NPM Scripts

### Development
```bash
npm run dev              # Start development server
npm run dev:monitored    # Start with Console Ninja monitoring
npm run dev:full         # Start with full auto-fixing and monitoring
npm run build            # Build for production
npm run start            # Start production server
```

### Code Quality & Fixing
```bash
npm run lint             # Run ESLint
npm run type-check       # Run TypeScript type checking
npm run check:lean       # Run both lint and type-check
npm run fix:all          # Run all fixes (lint, type-check, intelligent)
npm run fix:intelligent  # Enable intelligent auto-fixer
```

### Console Ninja & Monitoring
```bash
npm run console:ninja    # Test Console Ninja integration
npm run monitor:start    # Start self-healing monitoring
npm run monitor:stop     # Stop monitoring
npm run monitor:health   # Run health checks
```

### Nx Console Integration
```bash
npm run nx:generate      # Generate code with Nx
npm run nx:run           # Run Nx commands
npm run nx:build         # Build with Nx
npm run nx:test          # Test with Nx
npm run nx:lint          # Lint with Nx
```

### Translation Pipeline
```bash
npm run orchestrate      # Standard translation pipeline
npm run orchestrate:mcp  # MCP-enhanced pipeline
npm run scale:full       # Scale to full document
npm run validate:quality # Validate quality metrics
npm run report:final     # Generate final report
```

### GitHub CLI Integration
```bash
npm run github:setup     # Setup GitHub repository
npm run github:auth      # Authenticate with GitHub
npm run github:issues    # List GitHub issues
npm run github:pr        # Create pull request
```

### Audio & Export
```bash
npm run setup:audio      # Setup audio generation
npm run test:tts         # Test text-to-speech
npm run export:docx      # Export to DOCX
npm run export:audio     # Export audio files
npm run export:epub      # Export to EPUB
```

### Utilities
```bash
npm run smoke            # Run smoke tests
npm run bundlesize       # Analyze bundle size
npm run prune            # Check for unused dependencies
npm run status:dashboard # Show pipeline status
```

## Development Workflow

1. **Make Changes**: Edit code in your preferred editor
2. **Test Locally**: Run `npm run dev:full` and test at http://localhost:3000/tri
3. **Auto-Fix Issues**: Run `npm run fix:all` to automatically fix common issues
4. **Run Pipeline**: Execute `npm run orchestrate:mcp` for translation processing
5. **Validate Quality**: Run `npm run validate:quality` to check metrics
6. **Monitor Health**: Use `npm run monitor:health` to check platform health
7. **Create PR**: Use `npm run github:pr` to create pull request
8. **Review**: Use `gh pr status` to check review status

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
- [Console Ninja](https://console-ninja.com/) for enhanced debugging and structured logging
- [Nx Console](https://nx.dev/console) for intelligent code generation and auto-fixing
- [Next.js](https://nextjs.org/) and [React](https://reactjs.org/) for the web interface
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [TypeScript](https://www.typescriptlang.org/) for type safety
- [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) for code quality
