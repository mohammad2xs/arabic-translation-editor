# Git Authentication Setup

This document explains how to configure Git authentication for the Arabic Translation Editor repository.

## Quick Fix

If you're getting authentication errors when pushing to GitHub, run:

```bash
npm run github:auth:setup
```

This will diagnose the issue and provide specific instructions.

## Authentication Methods

### Method 1: GitHub CLI (Recommended)

1. **Authenticate with GitHub CLI:**
   ```bash
   gh auth login
   ```

2. **Configure Git to use GitHub CLI:**
   ```bash
   gh auth setup-git
   ```

3. **Test the setup:**
   ```bash
   git push --dry-run
   ```

### Method 2: Personal Access Token

1. **Create a Personal Access Token:**
   - Go to [GitHub Settings > Tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select "repo" scope for full repository access
   - Copy the generated token

2. **Update remote URL:**
   ```bash
   git remote set-url origin https://YOUR_TOKEN@github.com/mohammad2xs/arabic-translation-editor.git
   ```

### Method 3: GitHub Actions (CI/CD)

For automated workflows, ensure your GitHub Actions workflow has:

```yaml
- name: Configure Git Authentication
  run: |
    git config --global user.name "github-actions[bot]"
    git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git remote set-url origin https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/mohammad2xs/arabic-translation-editor.git
```

### Method 4: SSH Keys

1. **Generate SSH key** (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Add SSH key to GitHub account:**
   - Copy the public key: `cat ~/.ssh/id_ed25519.pub`
   - Go to [GitHub Settings > SSH Keys](https://github.com/settings/keys)
   - Click "New SSH key" and paste the key

3. **Update remote to use SSH:**
   ```bash
   git remote set-url origin git@github.com:mohammad2xs/arabic-translation-editor.git
   ```

## Troubleshooting

### Common Error Messages

- **"Authentication failed for 'https://github.com/'"**
  - Run `npm run github:auth:setup` for diagnosis
  - Follow the authentication setup steps above

- **"could not read Username for 'https://github.com'"**
  - This indicates missing credentials
  - Use Method 1 (GitHub CLI) or Method 2 (Token) above

- **"Permission denied (publickey)"** (SSH only)
  - Check if your SSH key is added to your GitHub account
  - Test SSH connection: `ssh -T git@github.com`

### Verification Commands

```bash
# Check current remote URL
git remote -v

# Test GitHub CLI authentication
gh auth status

# Test push access (dry run)
git push --dry-run

# Run full authentication diagnosis
npm run github:auth:setup
```

## Available Scripts

- `npm run github:auth:setup` - Diagnose and fix authentication issues
- `npm run github:auth` - Authenticate with GitHub CLI
- `npm run github:setup` - Set up GitHub repository and workflow
- `npm run github:issues` - List repository issues
- `npm run github:pr` - Create a pull request

## Security Notes

- Never commit tokens or credentials to the repository
- Use environment variables for tokens in CI/CD
- Regularly rotate personal access tokens
- Use fine-grained permissions when possible

## Need Help?

If you're still having issues:

1. Run the diagnostic script: `npm run github:auth:setup`
2. Check the [GitHub CLI documentation](https://cli.github.com/manual/)
3. Review [GitHub's authentication guide](https://docs.github.com/en/authentication)