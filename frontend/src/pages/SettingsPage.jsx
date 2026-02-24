import React, { useState, useEffect } from 'react';
import {
  Settings,
  Folder,
  Github,
  Database,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Save,
  Lock,
  Unlock,
  HardDrive,
  Trash2,
  Clock,
  FolderOpen,
  ChevronRight,
  Home,
  ArrowUp
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

function SettingsPage() {
  const [sourceConfig, setSourceConfig] = useState({
    mode: 'local',
    localPath: '../services',
    githubToken: '',
    githubRepo: '',
    githubBranch: 'main',
    allowModification: true
  });

  const [status, setStatus] = useState(null);
  const [dbStats, setDbStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Folder browser state
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState('');
  const [browserItems, setBrowserItems] = useState([]);
  const [browserParent, setBrowserParent] = useState(null);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState(null);

  // Fetch current status on mount
  useEffect(() => {
    fetchStatus();
    fetchDbStats();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/source-code/status`);
      const data = await res.json();
      setStatus(data);
      setSourceConfig(prev => ({
        ...prev,
        mode: data.mode,
        localPath: data.localPath || '../services',
        allowModification: data.allowModification
      }));
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDbStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/database/stats`);
      const data = await res.json();
      setDbStats(data);
    } catch (error) {
      console.error('Failed to fetch database stats:', error);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/source-code/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceConfig)
      });

      const data = await res.json();

      if (res.ok) {
        setStatus(data);
        setMessage({ type: 'success', text: 'Configuration saved successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const fetchGitHubRepos = async () => {
    if (!sourceConfig.githubToken) {
      setMessage({ type: 'error', text: 'Please enter a GitHub Personal Access Token (PAT) first' });
      return;
    }

    setLoadingRepos(true);
    setMessage(null);

    try {
      // First save the token and connect
      const configRes = await fetch(`${API_URL}/api/source-code/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'github',
          githubToken: sourceConfig.githubToken
        })
      });

      const configData = await configRes.json();

      if (!configRes.ok) {
        setMessage({ type: 'error', text: configData.error || 'Failed to connect to GitHub. Check your token.' });
        setLoadingRepos(false);
        return;
      }

      // Update status
      setStatus(configData);

      if (!configData.githubConnected) {
        setMessage({ type: 'error', text: 'GitHub connection failed. Make sure your token is valid and has repo access.' });
        setLoadingRepos(false);
        return;
      }

      setMessage({ type: 'success', text: `Connected as ${configData.githubUser}` });

      // Then fetch repos
      const res = await fetch(`${API_URL}/api/source-code/github/repos`);
      const data = await res.json();

      if (res.ok) {
        setRepos(data);
        if (data.length === 0) {
          setMessage({ type: 'warning', text: 'No repositories found. Make sure your token has repo access.' });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch repositories' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Connection error: ${error.message}` });
    } finally {
      setLoadingRepos(false);
    }
  };

  const runDatabaseCleanup = async () => {
    try {
      const res = await fetch(`${API_URL}/api/database/cleanup`, {
        method: 'POST'
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Database cleanup completed!' });
        fetchDbStats();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Cleanup failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Open folder browser
  const openFolderBrowser = async () => {
    setShowFolderBrowser(true);
    setBrowserError(null);
    await browseTo('');
  };

  // Browse to a directory
  const browseTo = async (path) => {
    setBrowserLoading(true);
    setBrowserError(null);

    try {
      const url = path
        ? `${API_URL}/api/browse-directories?path=${encodeURIComponent(path)}`
        : `${API_URL}/api/browse-directories`;

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setBrowserPath(data.path || '');
        setBrowserItems(data.items || []);
        setBrowserParent(data.parent);
      } else {
        setBrowserError(data.error || 'Failed to browse directory');
      }
    } catch (error) {
      setBrowserError(`Failed to connect: ${error.message}`);
    } finally {
      setBrowserLoading(false);
    }
  };

  // Select folder and close browser
  const selectFolder = (path) => {
    setSourceConfig(prev => ({ ...prev, localPath: path }));
    setShowFolderBrowser(false);
    setMessage({ type: 'success', text: `Selected: ${path}` });
  };

  // Select current folder
  const selectCurrentFolder = () => {
    if (browserPath) {
      selectFolder(browserPath);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-cyan-500" />
            Settings
          </h1>
          <p className="text-slate-400 mt-1">Configure LogLens source code access and database</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-cyber-green/20 border border-cyber-green/30'
            : 'bg-cyber-red/20 border border-cyber-red/30'
        }`}>
          {message.type === 'success' ? (
            <Check className="w-5 h-5 text-cyber-green" />
          ) : (
            <AlertCircle className="w-5 h-5 text-cyber-red" />
          )}
          <span className={message.type === 'success' ? 'text-cyber-green' : 'text-cyber-red'}>
            {message.text}
          </span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Code Configuration */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder className="w-5 h-5 text-cyan-500" />
            Source Code Access
          </h2>

          <div className="space-y-4">
            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Access Mode
              </label>
              <div className="flex gap-2">
                {['local', 'github', 'none'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSourceConfig(prev => ({ ...prev, mode }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      sourceConfig.mode === mode
                        ? 'bg-cyan-500 text-white'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {mode === 'local' && <Folder className="w-4 h-4 inline mr-2" />}
                    {mode === 'github' && <Github className="w-4 h-4 inline mr-2" />}
                    {mode === 'none' && <X className="w-4 h-4 inline mr-2" />}
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Local Mode Settings */}
            {sourceConfig.mode === 'local' && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Source Code Directory
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sourceConfig.localPath}
                    onChange={(e) => setSourceConfig(prev => ({ ...prev, localPath: e.target.value }))}
                    className="input-glass flex-1"
                    placeholder="C:\path\to\services"
                  />
                  <button
                    onClick={openFolderBrowser}
                    className="btn-glass px-4 flex items-center gap-2"
                    title="Browse folders"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Browse
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Select the folder containing your microservices source code
                </p>
              </div>
            )}

            {/* GitHub Mode Settings */}
            {sourceConfig.mode === 'github' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    GitHub Personal Access Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={sourceConfig.githubToken}
                      onChange={(e) => setSourceConfig(prev => ({ ...prev, githubToken: e.target.value }))}
                      className="input-glass flex-1"
                      placeholder="ghp_xxxxxxxxxxxx"
                    />
                    <button
                      onClick={fetchGitHubRepos}
                      disabled={loadingRepos}
                      className="btn-glass px-4"
                    >
                      {loadingRepos ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Create a token at GitHub &gt; Settings &gt; Developer settings &gt; Personal access tokens.
                    Required scopes: <span className="text-cyan-400">repo</span> (for private repos) or <span className="text-cyan-400">public_repo</span> (for public only)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Repository
                  </label>
                  {repos.length > 0 ? (
                    <select
                      value={sourceConfig.githubRepo}
                      onChange={(e) => setSourceConfig(prev => ({ ...prev, githubRepo: e.target.value }))}
                      className="input-glass w-full"
                    >
                      <option value="">Select a repository...</option>
                      {repos.map(repo => (
                        <option key={repo.fullName} value={repo.fullName}>
                          {repo.fullName} ({repo.defaultBranch})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={sourceConfig.githubRepo}
                      onChange={(e) => setSourceConfig(prev => ({ ...prev, githubRepo: e.target.value }))}
                      className="input-glass w-full"
                      placeholder="owner/repository"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={sourceConfig.githubBranch}
                    onChange={(e) => setSourceConfig(prev => ({ ...prev, githubBranch: e.target.value }))}
                    className="input-glass w-full"
                    placeholder="main"
                  />
                </div>
              </>
            )}

            {/* Modification Permission */}
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <div className="flex items-center gap-3">
                {sourceConfig.allowModification ? (
                  <Unlock className="w-5 h-5 text-cyber-yellow" />
                ) : (
                  <Lock className="w-5 h-5 text-slate-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-white">Allow Code Modifications</p>
                  <p className="text-xs text-slate-500">AI can suggest code fixes (requires confirmation)</p>
                </div>
              </div>
              <button
                onClick={() => setSourceConfig(prev => ({ ...prev, allowModification: !prev.allowModification }))}
                className={`w-12 h-6 rounded-full transition-colors ${
                  sourceConfig.allowModification ? 'bg-cyan-500' : 'bg-slate-600'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  sourceConfig.allowModification ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Save Button */}
            <button
              onClick={saveConfig}
              disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Configuration
            </button>
          </div>
        </div>

        {/* Database Status */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-500" />
            Log Database
          </h2>

          {dbStats ? (
            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-lg border-l-4 border-cyan-500">
                  <p className="text-xs text-slate-400 mb-1">Total Logs</p>
                  <p className="text-2xl font-bold text-white">
                    {dbStats.totalLogs?.toLocaleString() || 0}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-lg border-l-4 border-cyber-red">
                  <p className="text-xs text-slate-400 mb-1">Errors</p>
                  <p className="text-2xl font-bold text-cyber-red">
                    {dbStats.errorCount?.toLocaleString() || 0}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-lg border-l-4 border-cyber-green">
                  <p className="text-xs text-slate-400 mb-1">Unique Patterns</p>
                  <p className="text-2xl font-bold text-cyber-green">
                    {dbStats.uniquePatterns?.toLocaleString() || 0}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-lg border-l-4 border-slate-500">
                  <p className="text-xs text-slate-400 mb-1">Database Size</p>
                  <p className="text-2xl font-bold text-white">
                    {dbStats.dbSize ? formatBytes(dbStats.dbSize) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Database Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Database Path
                  </span>
                  <span className="text-white font-mono text-xs">
                    {dbStats.dbPath || 'Not configured'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Retention Period
                  </span>
                  <span className="text-white">
                    {dbStats.retentionDays || 7} days
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Status</span>
                  <span className={`badge ${dbStats.ready ? 'badge-success' : 'badge-error'}`}>
                    {dbStats.ready ? 'Ready' : 'Not Ready'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={runDatabaseCleanup}
                  className="btn-glass w-full flex items-center justify-center gap-2 text-cyber-yellow"
                >
                  <Trash2 className="w-4 h-4" />
                  Run Cleanup (Remove Old Logs)
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Database not available</p>
              <p className="text-xs mt-1">Check if better-sqlite3 is installed</p>
            </div>
          )}
        </div>
      </div>

      {/* Current Status Card */}
      {status && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Configuration Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Mode</p>
              <p className="text-lg font-bold text-cyan-400">{status.mode}</p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Local Path</p>
              <p className="text-sm font-mono text-white truncate" title={status.localPath}>
                {status.localPath || 'N/A'}
              </p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">GitHub</p>
              <p className="text-lg font-bold text-white">
                {status.githubConnected ? (
                  <span className="text-cyber-green">@{status.githubUser}</span>
                ) : (
                  <span className="text-slate-500">Not Connected</span>
                )}
              </p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Pending Fixes</p>
              <p className="text-lg font-bold text-cyber-yellow">
                {status.pendingModifications || 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Folder Browser Modal */}
      {showFolderBrowser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-cyan-500" />
                Select Source Code Folder
              </h3>
              <button
                onClick={() => setShowFolderBrowser(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Path */}
            <div className="p-3 bg-white/5 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm">
                <Home className="w-4 h-4 text-slate-400" />
                <span className="text-cyan-400 font-mono truncate">
                  {browserPath || 'Root'}
                </span>
              </div>
            </div>

            {/* Navigation and Content */}
            <div className="flex-1 overflow-y-auto p-2">
              {browserLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
                </div>
              ) : browserError ? (
                <div className="p-4 text-center text-cyber-red">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>{browserError}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Go Up Button */}
                  {browserParent !== null && (
                    <button
                      onClick={() => browseTo(browserParent)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 text-left group"
                    >
                      <ArrowUp className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
                      <span className="text-slate-300 group-hover:text-white">..</span>
                      <span className="text-xs text-slate-500 ml-auto">Parent Directory</span>
                    </button>
                  )}

                  {/* Directory List */}
                  {browserItems.length === 0 && !browserParent ? (
                    <div className="text-center py-8 text-slate-400">
                      <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No directories found</p>
                    </div>
                  ) : (
                    browserItems.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => browseTo(item.path)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 text-left group"
                      >
                        <Folder className="w-5 h-5 text-cyan-500" />
                        <span className="text-white group-hover:text-cyan-400 flex-1 truncate">
                          {item.name}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-400 truncate flex-1">
                {browserPath ? `Selected: ${browserPath}` : 'Navigate to your services folder'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFolderBrowser(false)}
                  className="btn-glass px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={selectCurrentFolder}
                  disabled={!browserPath}
                  className="btn-primary px-4 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Select This Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;