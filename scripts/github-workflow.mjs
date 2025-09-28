#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

class GitHubWorkflow {
  constructor() {
    this.repoName = 'arabic-translation-editor';
    this.owner = 'mohammad2xs'; // Corrected GitHub username
  }

  async checkGitHubCLI() {
    try {
      execSync('gh --version', { stdio: 'pipe' });
      console.log('✅ GitHub CLI is installed');
      return true;
    } catch (error) {
      console.error('❌ GitHub CLI not found. Install with: brew install gh');
      return false;
    }
  }

  async authenticate() {
    try {
      const result = execSync('gh auth status', { stdio: 'pipe' }).toString();
      console.log('✅ GitHub CLI authenticated');
      console.log(result);
      return true;
    } catch (error) {
      console.log('🔐 Please authenticate with GitHub CLI:');
      console.log('Run: gh auth login');
      return false;
    }
  }

  async createRepository() {
    try {
      console.log('🚀 Creating GitHub repository...');
      
      // Check if repository already exists
      try {
        execSync(`gh repo view ${this.owner}/${this.repoName}`, { stdio: 'pipe' });
        console.log('✅ Repository already exists');
        return true;
      } catch (error) {
        // Repository doesn't exist, create it
      }

      const result = execSync(`gh repo create ${this.repoName} --public --description "Arabic Translation Editor with MCP Integration" --clone=false`, { 
        stdio: 'pipe' 
      }).toString();
      
      console.log('✅ Repository created successfully');
      console.log(result);
      return true;
    } catch (error) {
      console.error('❌ Failed to create repository:', error.message);
      return false;
    }
  }

  async setupRepository() {
    try {
      console.log('📝 Setting up repository...');
      
      // Check if remote origin already exists
      try {
        const existingRemote = execSync('git remote get-url origin', { stdio: 'pipe' }).toString().trim();
        console.log(`ℹ️  Remote origin already exists: ${existingRemote}`);
      } catch (error) {
        // Add remote origin if it doesn't exist
        console.log('🔗 Adding remote origin...');
        execSync(`git remote add origin https://github.com/${this.owner}/${this.repoName}.git`, { stdio: 'pipe' });
      }
      
      // Create initial commit if there are changes
      try {
        execSync('git add .', { stdio: 'pipe' });
        execSync('git commit -m "Initial commit: Arabic Translation Editor with MCP Integration"', { stdio: 'pipe' });
        console.log('✅ Created initial commit');
      } catch (error) {
        console.log('ℹ️  No changes to commit or commit already exists');
      }
      
      // Push to main branch
      try {
        execSync('git branch -M main', { stdio: 'pipe' });
        console.log('🚀 Pushing to main branch...');
        execSync('git push -u origin main', { stdio: 'pipe' });
        console.log('✅ Successfully pushed to GitHub');
      } catch (error) {
        console.error('❌ Failed to push to GitHub:', error.message);
        console.log('\n🔐 Authentication Required:');
        console.log('It looks like Git cannot authenticate with GitHub.');
        console.log('Run the following command to configure authentication:');
        console.log('  npm run github:auth:setup');
        console.log('or manually run:');
        console.log('  node scripts/setup-git-auth.mjs');
        return false;
      }
      
      console.log('✅ Repository setup complete');
      return true;
    } catch (error) {
      console.error('❌ Failed to setup repository:', error.message);
      console.log('\n💡 Try running: node scripts/setup-git-auth.mjs');
      return false;
    }
  }

  async createIssues() {
    const issues = [
      {
        title: 'Enhance MCP Integration',
        body: 'Improve MCP server integration with better error handling and retry logic',
        labels: ['enhancement', 'mcp']
      },
      {
        title: 'Add Real-time Translation Preview',
        body: 'Implement real-time preview of translations as user types',
        labels: ['feature', 'ui']
      },
      {
        title: 'Implement Quality Metrics Dashboard',
        body: 'Create a dashboard to visualize translation quality metrics and LPR scores',
        labels: ['feature', 'dashboard']
      },
      {
        title: 'Add Batch Translation Processing',
        body: 'Allow users to process multiple sections or documents in batch',
        labels: ['feature', 'performance']
      }
    ];

    try {
      console.log('📋 Creating GitHub issues...');
      
      for (const issue of issues) {
        const result = execSync(`gh issue create --title "${issue.title}" --body "${issue.body}" --label "${issue.labels.join(',')}"`, { 
          stdio: 'pipe' 
        }).toString();
        console.log(`✅ Created issue: ${issue.title}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to create issues:', error.message);
      return false;
    }
  }

  async createPullRequestTemplate() {
    const template = `---
name: Pull Request
about: Describe your changes
title: ''
labels: ''
assignees: ''
---

## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Manual testing completed
- [ ] Translation quality verified

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated if needed
- [ ] No breaking changes (or clearly documented)

## Translation Quality
- [ ] LPR scores meet requirements (≥1.05)
- [ ] Quality gates pass
- [ ] Scripture references verified
- [ ] MCP integration tested (if applicable)
`;

    try {
      await fs.mkdir('.github', { recursive: true });
      await fs.mkdir('.github/pull_request_template', { recursive: true });
      await fs.writeFile('.github/pull_request_template.md', template);
      console.log('✅ Pull request template created');
      return true;
    } catch (error) {
      console.error('❌ Failed to create PR template:', error.message);
      return false;
    }
  }

  async run() {
    console.log('🚀 Setting up GitHub workflow for Arabic Translation Editor\n');

    // Check prerequisites
    if (!(await this.checkGitHubCLI())) return;
    if (!(await this.authenticate())) return;

    // Setup repository
    await this.createRepository();
    await this.setupRepository();
    await this.createIssues();
    await this.createPullRequestTemplate();

    console.log('\n🎉 GitHub workflow setup complete!');
    console.log(`📁 Repository: https://github.com/${this.owner}/${this.repoName}`);
    console.log('📋 Issues created for project tracking');
    console.log('📝 Pull request template added');
    
    console.log('\n🔧 Useful GitHub CLI commands:');
    console.log('  gh issue list                    # List all issues');
    console.log('  gh pr create                     # Create a pull request');
    console.log('  gh pr status                     # Check PR status');
    console.log('  gh repo view                     # View repository info');
  }
}

// Run the workflow
const workflow = new GitHubWorkflow();
workflow.run().catch(console.error);
