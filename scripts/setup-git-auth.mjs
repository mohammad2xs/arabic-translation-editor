#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.bold}${msg}${colors.reset}`)
};

class GitAuthSetup {
  constructor() {
    this.repoName = 'arabic-translation-editor';
    this.owner = 'mohammad2xs';
    this.repoUrl = `https://github.com/${this.owner}/${this.repoName}`;
  }

  checkCurrentAuth() {
    try {
      const remoteUrl = execSync('git remote get-url origin', { stdio: 'pipe' }).toString().trim();
      log.info(`Current remote URL: ${remoteUrl}`);
      
      // Check if URL already has token
      if (remoteUrl.includes('@github.com')) {
        log.success('Remote URL appears to have authentication configured');
        return { hasAuth: true, url: remoteUrl };
      }
      
      return { hasAuth: false, url: remoteUrl };
    } catch (error) {
      log.error(`Failed to get remote URL: ${error.message}`);
      return { hasAuth: false, url: null };
    }
  }

  checkGitHubCLI() {
    try {
      execSync('gh --version', { stdio: 'pipe' });
      log.success('GitHub CLI is available');
      return true;
    } catch (error) {
      log.warn('GitHub CLI not found. Install with: brew install gh (macOS) or see https://cli.github.com/');
      return false;
    }
  }

  checkGitHubCLIAuth() {
    try {
      const result = execSync('gh auth status', { stdio: 'pipe' }).toString();
      log.success('GitHub CLI is authenticated');
      return true;
    } catch (error) {
      log.warn('GitHub CLI not authenticated');
      return false;
    }
  }

  testPushAccess() {
    log.step('Testing push access...');
    try {
      // Try to push with dry-run
      execSync('git push --dry-run', { stdio: 'pipe' });
      log.success('Git push access is working');
      return true;
    } catch (error) {
      const errorMsg = error.message || error.toString();
      if (errorMsg.includes('Authentication failed') || errorMsg.includes('could not read Username')) {
        log.error('Git push authentication failed - credentials needed');
        return false;
      }
      // Other errors might be fine (like up-to-date)
      log.info('Git push test completed (may be up-to-date)');
      return true;
    }
  }

  provideSolutions() {
    log.step('\n🔧 Authentication Solutions:\n');
    
    console.log(`${colors.bold}Option 1: Using GitHub CLI (Recommended)${colors.reset}`);
    console.log('1. Authenticate with GitHub CLI:');
    console.log('   gh auth login');
    console.log('2. Configure Git to use GitHub CLI:');
    console.log('   gh auth setup-git');
    console.log('');
    
    console.log(`${colors.bold}Option 2: Using Personal Access Token${colors.reset}`);
    console.log('1. Create a Personal Access Token:');
    console.log('   - Go to https://github.com/settings/tokens');
    console.log('   - Click "Generate new token (classic)"');
    console.log('   - Select "repo" scope for full repository access');
    console.log('   - Copy the generated token');
    console.log('2. Update remote URL with token:');
    console.log(`   git remote set-url origin https://YOUR_TOKEN@github.com/${this.owner}/${this.repoName}.git`);
    console.log('');
    
    console.log(`${colors.bold}Option 3: Using GitHub Actions Token (CI/CD)${colors.reset}`);
    console.log('If running in GitHub Actions, ensure GITHUB_TOKEN is available:');
    console.log('1. In your workflow, use:');
    console.log('   - name: Configure Git');
    console.log('     run: |');
    console.log('       git config --global user.name "github-actions[bot]"');
    console.log('       git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    console.log(`       git remote set-url origin https://x-access-token:\${{ secrets.GITHUB_TOKEN }}@github.com/${this.owner}/${this.repoName}.git`);
    console.log('');
    
    console.log(`${colors.bold}Option 4: Using SSH (Advanced)${colors.reset}`);
    console.log('1. Generate SSH key and add to GitHub account');
    console.log('2. Update remote to use SSH:');
    console.log(`   git remote set-url origin git@github.com:${this.owner}/${this.repoName}.git`);
  }

  async run() {
    log.step('🔐 Git Authentication Setup Helper\n');
    
    // Check current state
    const authCheck = this.checkCurrentAuth();
    const hasGitHubCLI = this.checkGitHubCLI();
    const cliAuthenticated = hasGitHubCLI ? this.checkGitHubCLIAuth() : false;
    
    // Test push access
    const canPush = this.testPushAccess();
    
    if (canPush) {
      log.success('\n🎉 Git authentication is working correctly!');
      log.info('You should be able to push changes to the repository.');
      return;
    }
    
    log.error('\n❌ Git authentication issue detected');
    
    if (hasGitHubCLI && !cliAuthenticated) {
      log.info('\n💡 Quick fix: Run the following commands:');
      console.log('   gh auth login');
      console.log('   gh auth setup-git');
    }
    
    this.provideSolutions();
    
    console.log(`\n${colors.dim}💡 After configuring authentication, test it by running:${colors.reset}`);
    console.log('   git push --dry-run');
    console.log('   npm run github:setup  # To verify GitHub CLI integration');
  }
}

// Run the setup
const authSetup = new GitAuthSetup();
authSetup.run().catch(console.error);