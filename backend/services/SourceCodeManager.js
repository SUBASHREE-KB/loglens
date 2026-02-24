/**
 * Source Code Manager
 * Handles dynamic source code access from local filesystem or GitHub
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SourceCodeManager {
  constructor() {
    this.mode = process.env.SOURCE_CODE_MODE || 'local';
    this.localPath = process.env.LOCAL_CODE_PATH || '../services';
    this.githubToken = process.env.GITHUB_TOKEN || null;
    this.allowModification = process.env.ALLOW_CODE_MODIFICATION === 'true';

    // Pending modifications awaiting user confirmation
    this.pendingModifications = new Map();

    // GitHub client (lazy loaded)
    this.octokit = null;
    this.githubRepo = process.env.GITHUB_REPO || null;
    this.githubBranch = process.env.GITHUB_BRANCH || 'main';
    this.githubUser = null;

    // Service path mappings (can be configured dynamically)
    this.serviceMappings = {
      'API-GATEWAY': 'api-gateway',
      'USER-SERVICE': 'user-service',
      'DB-SERVICE': 'db-service',
      'AUTH-SERVICE': 'auth-service',
      'ORDER-SERVICE': 'order-service'
    };

    console.log(`[SourceCodeManager] Initialized in ${this.mode} mode`);
  }

  /**
   * Get current configuration status
   */
  getStatus() {
    return {
      mode: this.mode,
      localPath: this.mode === 'local' ? this.resolvePath(this.localPath) : null,
      localPathConfigured: this.mode === 'local',
      githubConnected: !!this.githubUser,
      githubUser: this.githubUser,
      githubRepo: this.githubRepo,
      githubBranch: this.githubBranch,
      allowModification: this.allowModification,
      pendingModifications: this.pendingModifications.size
    };
  }

  /**
   * Configure source code access
   */
  async configure(config) {
    const { mode, localPath, githubToken, githubRepo, githubBranch, allowModification } = config;

    if (mode) {
      this.mode = mode;
    }

    if (localPath) {
      this.localPath = localPath;
      // Only verify path existence in local mode
      if (this.mode === 'local') {
        const exists = await this.verifyLocalPath(localPath);
        if (!exists) {
          throw new Error(`Local path does not exist: ${this.resolvePath(localPath)}`);
        }
      }
    }

    // When switching away from local mode, retain localPath for if user switches back
    // but do NOT validate it

    if (githubToken) {
      this.githubToken = githubToken;
      const connected = await this.initializeGitHub();
      if (!connected) {
        throw new Error('Failed to connect to GitHub. Check your token.');
      }
    }

    if (githubRepo) {
      this.githubRepo = githubRepo;
    }

    if (githubBranch) {
      this.githubBranch = githubBranch;
    }

    if (typeof allowModification === 'boolean') {
      this.allowModification = allowModification;
    }

    console.log(`[SourceCodeManager] Configuration updated:`, this.getStatus());
    return this.getStatus();
  }

  /**
   * Verify local path exists and is accessible
   */
  /**
   * Resolve a user-supplied path to absolute.
   * Absolute paths are used as-is; relative paths are resolved
   * relative to the backend root (one level above __dirname).
   */
  resolvePath(rawPath) {
    if (path.isAbsolute(rawPath)) {
      return rawPath;
    }
    return path.resolve(__dirname, '..', rawPath);
  }

  async verifyLocalPath(localPath) {
    try {
      const resolvedPath = this.resolvePath(localPath);
      const stat = await fs.stat(resolvedPath);
      return stat.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize GitHub client
   */
  async initializeGitHub() {
    if (!this.githubToken) {
      console.warn('[SourceCodeManager] No GitHub token provided');
      return false;
    }

    try {
      // Try to use @octokit/rest if installed
      let Octokit;
      try {
        Octokit = require('@octokit/rest').Octokit;
      } catch (e) {
        // @octokit/rest not installed, use fetch instead
        console.log('[SourceCodeManager] @octokit/rest not installed, using fetch API');
        return await this.initializeGitHubWithFetch();
      }

      this.octokit = new Octokit({ auth: this.githubToken });

      // Verify token is valid
      const { data } = await this.octokit.users.getAuthenticated();
      this.githubUser = data.login;
      console.log(`[SourceCodeManager] GitHub authenticated as: ${data.login}`);
      return true;
    } catch (error) {
      console.error('[SourceCodeManager] GitHub authentication failed:', error.message);
      this.octokit = null;
      this.githubUser = null;
      return false;
    }
  }

  /**
   * Initialize GitHub using fetch (when @octokit/rest not available)
   */
  async initializeGitHubWithFetch() {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LogLens'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      this.githubUser = data.login;
      console.log(`[SourceCodeManager] GitHub authenticated as: ${data.login}`);
      return true;
    } catch (error) {
      console.error('[SourceCodeManager] GitHub auth failed:', error.message);
      this.githubUser = null;
      return false;
    }
  }

  /**
   * List available GitHub repositories
   */
  async listGitHubRepos() {
    if (!this.githubToken) {
      throw new Error('GitHub token not configured');
    }

    try {
      // Use fetch for compatibility
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LogLens'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      return data.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        private: repo.private,
        url: repo.html_url
      }));
    } catch (error) {
      console.error('[SourceCodeManager] Failed to list repos:', error.message);
      throw error;
    }
  }

  /**
   * Map service name from logs to directory name
   */
  mapServiceName(logServiceName) {
    if (!logServiceName) return 'user-service';

    const normalized = logServiceName.toUpperCase().trim()
      .replace(/^LOGLENS[-_]/i, '')
      .replace(/^KUBEWHISPER[-_]/i, '');

    // Check direct mapping
    if (this.serviceMappings[normalized]) {
      return this.serviceMappings[normalized];
    }

    // Check partial matches
    for (const [key, value] of Object.entries(this.serviceMappings)) {
      if (normalized.includes(key.replace(/-/g, ''))) {
        return value;
      }
    }

    // Dynamic fallback
    return logServiceName.toLowerCase()
      .replace(/^loglens[-_]/i, '')
      .replace(/^kubewhisper[-_]/i, '')
      .replace(/_/g, '-')
      .replace(/\s+/g, '-');
  }

  /**
   * Get service path based on current mode
   */
  getServicePath(serviceName) {
    const mapped = this.mapServiceName(serviceName);

    if (this.mode === 'local') {
      return path.join(this.resolvePath(this.localPath), mapped);
    }

    return mapped; // For GitHub, just return the directory name
  }

  /**
   * Read source code file
   */
  async readFile(serviceName, fileName) {
    if (this.mode === 'none') {
      return null;
    }

    const mappedService = this.mapServiceName(serviceName);

    if (this.mode === 'local') {
      return this.readLocalFile(mappedService, fileName);
    } else if (this.mode === 'github') {
      return this.readGitHubFile(mappedService, fileName);
    }

    return null;
  }

  /**
   * Read file from local filesystem
   */
  async readLocalFile(serviceName, fileName) {
    const filePath = path.join(this.resolvePath(this.localPath), serviceName, fileName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`[SourceCodeManager] Read local: ${filePath} (${content.length} bytes)`);
      return {
        content,
        path: filePath,
        source: 'local'
      };
    } catch (error) {
      console.error(`[SourceCodeManager] Failed to read ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Read file from GitHub
   */
  async readGitHubFile(serviceName, fileName) {
    if (!this.githubRepo) {
      console.warn('[SourceCodeManager] GitHub repo not configured');
      return null;
    }

    try {
      const [owner, repo] = this.githubRepo.split('/');
      const filePath = `services/${serviceName}/${fileName}`;

      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${this.githubBranch}`;
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LogLens'
      };

      if (this.githubToken) {
        headers['Authorization'] = `token ${this.githubToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.type !== 'file') {
        return null;
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      console.log(`[SourceCodeManager] Read GitHub: ${filePath} (${content.length} bytes)`);

      return {
        content,
        path: filePath,
        sha: data.sha,
        source: 'github'
      };
    } catch (error) {
      console.error(`[SourceCodeManager] GitHub read failed:`, error.message);
      return null;
    }
  }

  /**
   * List files in a service directory
   */
  async listFiles(serviceName) {
    const mappedService = this.mapServiceName(serviceName);

    if (this.mode === 'local') {
      return this.listLocalFiles(mappedService);
    } else if (this.mode === 'github') {
      return this.listGitHubFiles(mappedService);
    }

    return [];
  }

  /**
   * List local files
   */
  async listLocalFiles(serviceName) {
    const servicePath = path.join(this.resolvePath(this.localPath), serviceName);

    try {
      const files = await fs.readdir(servicePath);
      return files.filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.json'));
    } catch (error) {
      console.error(`[SourceCodeManager] Failed to list ${servicePath}:`, error.message);
      return [];
    }
  }

  /**
   * List GitHub files
   */
  async listGitHubFiles(serviceName) {
    if (!this.githubRepo) {
      return [];
    }

    try {
      const [owner, repo] = this.githubRepo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/services/${serviceName}?ref=${this.githubBranch}`;

      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LogLens'
      };

      if (this.githubToken) {
        headers['Authorization'] = `token ${this.githubToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .filter(item => item.type === 'file')
        .filter(item => item.name.endsWith('.js') || item.name.endsWith('.ts'))
        .map(item => item.name);
    } catch (error) {
      console.error(`[SourceCodeManager] GitHub list failed:`, error.message);
      return [];
    }
  }

  /**
   * Request code modification (creates pending modification)
   */
  async requestModification(modification) {
    const { filePath, serviceName, fileName, oldCode, newCode, explanation } = modification;

    // Generate unique ID for this modification request
    const modificationId = crypto.randomBytes(16).toString('hex');

    // Calculate diff
    const diff = this.generateDiff(oldCode, newCode);

    const pendingMod = {
      id: modificationId,
      filePath,
      serviceName,
      fileName,
      oldCode,
      newCode,
      explanation,
      diff,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    this.pendingModifications.set(modificationId, pendingMod);
    console.log(`[SourceCodeManager] Modification requested: ${modificationId}`);

    return {
      modificationId,
      ...pendingMod
    };
  }

  /**
   * Generate simple diff
   */
  generateDiff(oldCode, newCode) {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');

    const diff = [];
    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (oldLine) diff.push({ type: 'removed', line: i + 1, content: oldLine });
        if (newLine) diff.push({ type: 'added', line: i + 1, content: newLine });
      }
    }

    return diff;
  }

  /**
   * Get pending modification
   */
  getPendingModification(modificationId) {
    return this.pendingModifications.get(modificationId);
  }

  /**
   * List all pending modifications
   */
  listPendingModifications() {
    return Array.from(this.pendingModifications.values());
  }

  /**
   * Confirm and apply modification
   */
  async confirmModification(modificationId) {
    const modification = this.pendingModifications.get(modificationId);

    if (!modification) {
      throw new Error(`Modification not found: ${modificationId}`);
    }

    if (!this.allowModification) {
      throw new Error('Code modification is disabled');
    }

    try {
      if (this.mode === 'local') {
        await this.applyLocalModification(modification);
      } else if (this.mode === 'github') {
        throw new Error('GitHub modifications require manual PR creation');
      }

      modification.status = 'applied';
      modification.appliedAt = new Date().toISOString();

      console.log(`[SourceCodeManager] Modification applied: ${modificationId}`);
      return modification;
    } catch (error) {
      modification.status = 'failed';
      modification.error = error.message;
      throw error;
    }
  }

  /**
   * Reject modification
   */
  rejectModification(modificationId) {
    const modification = this.pendingModifications.get(modificationId);

    if (!modification) {
      throw new Error(`Modification not found: ${modificationId}`);
    }

    modification.status = 'rejected';
    modification.rejectedAt = new Date().toISOString();

    console.log(`[SourceCodeManager] Modification rejected: ${modificationId}`);
    return modification;
  }

  /**
   * Apply modification to local file
   */
  async applyLocalModification(modification) {
    const { filePath, oldCode, newCode } = modification;

    // Read current content to verify it matches
    const currentContent = await fs.readFile(filePath, 'utf-8');

    // Replace the old code with new code
    if (!currentContent.includes(oldCode.trim())) {
      throw new Error('Source code has changed since fix was generated. Please regenerate the fix.');
    }

    const updatedContent = currentContent.replace(oldCode.trim(), newCode.trim());

    // Create backup
    const backupPath = `${filePath}.backup.${Date.now()}`;
    await fs.writeFile(backupPath, currentContent);
    console.log(`[SourceCodeManager] Backup created: ${backupPath}`);

    // Write new content
    await fs.writeFile(filePath, updatedContent);
    console.log(`[SourceCodeManager] File updated: ${filePath}`);

    return { backupPath, filePath };
  }

  /**
   * Clean up old pending modifications
   */
  cleanupOldModifications(maxAgeMs = 3600000) { // 1 hour
    const now = Date.now();
    let cleaned = 0;

    for (const [id, mod] of this.pendingModifications.entries()) {
      const age = now - new Date(mod.timestamp).getTime();
      if (age > maxAgeMs && mod.status === 'pending') {
        this.pendingModifications.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SourceCodeManager] Cleaned up ${cleaned} old modifications`);
    }
  }
}

// Singleton instance
const sourceCodeManager = new SourceCodeManager();

module.exports = sourceCodeManager;