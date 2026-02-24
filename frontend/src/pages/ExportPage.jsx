import React, { useState, useEffect } from 'react';
import { Download, FileText, Database, Clock, Calendar, CheckCircle, AlertCircle, Brain, History, Wrench } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function ExportPage({ logs, metrics, metricsHistory }) {
  const [exportFormat, setExportFormat] = useState('json');
  const [dateRange, setDateRange] = useState('all');
  const [exportType, setExportType] = useState('logs');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [includeResolutions, setIncludeResolutions] = useState(true);
  const [includePredictions, setIncludePredictions] = useState(true);
  const [dbStats, setDbStats] = useState(null);
  const [error, setError] = useState(null);

  // Fetch database stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/database/stats`);
        if (res.ok) {
          const data = await res.json();
          setDbStats(data);
        }
      } catch (e) {
        console.log('Could not fetch database stats');
      }
    };
    fetchStats();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setError(null);

    try {
      // Determine date filters
      let startDate, endDate;
      const now = new Date();

      switch (dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        default:
          // 'all' - no date filter
          break;
      }

      // For full export or errors, fetch from backend database
      if (exportType === 'full' || exportType === 'errors') {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        params.append('includeResolutions', String(includeResolutions));
        params.append('includePredictions', String(includePredictions));
        params.append('format', exportFormat);

        const endpoint = exportType === 'full' ? '/api/export/full' : '/api/export/errors';
        const response = await fetch(`${API_URL}${endpoint}?${params.toString()}`);

        if (!response.ok) {
          throw new Error('Export failed');
        }

        // Download the file
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Use server-provided filename if available, otherwise construct one
        const disposition = response.headers.get('Content-Disposition') || '';
        const serverFilename = disposition.match(/filename=([^;]+)/)?.[1];
        a.download = serverFilename || `loglens-${exportType}-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setIsExporting(false);
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 3000);
        return;
      }

      // For local data exports (logs, metrics, history)
      let data;
      let filename;

      switch (exportType) {
        case 'logs':
          data = logs;
          filename = `loglens-logs-${new Date().toISOString().split('T')[0]}`;
          break;
        case 'metrics':
          data = metrics;
          filename = `loglens-metrics-${new Date().toISOString().split('T')[0]}`;
          break;
        case 'history':
          data = metricsHistory;
          filename = `loglens-history-${new Date().toISOString().split('T')[0]}`;
          break;
        default:
          data = { logs, metrics, metricsHistory };
          filename = `loglens-export-${new Date().toISOString().split('T')[0]}`;
      }

      // Create file content
      let content;
      let mimeType;

      if (exportFormat === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        filename += '.json';
      } else {
        // CSV format
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0]).join(',');
          const rows = data.map(item =>
            Object.values(item).map(v =>
              typeof v === 'object' ? `"${JSON.stringify(v).replace(/"/g, '""')}"` : `"${v}"`
            ).join(',')
          ).join('\n');
          content = `${headers}\n${rows}`;
        } else {
          content = JSON.stringify(data);
        }
        mimeType = 'text/csv';
        filename += '.csv';
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Download className="w-7 h-7 text-electric-400" />
            Export Data
          </h1>
          <p className="text-slate-400 mt-1">Download logs, metrics, errors, and historical analysis data</p>
        </div>

        {/* Database Status */}
        {dbStats && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <Database className="w-4 h-4 text-electric-400" />
            <span className="text-sm text-slate-300">
              {dbStats.mode === 'supabase' ? 'Supabase' : 'In-Memory'}: {dbStats.totalLogs} logs, {dbStats.errorCount} errors
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-300">{error}</span>
        </div>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white">Export Configuration</h2>

          {/* Export Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-400">Data Type</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'logs', label: 'Session Logs', icon: FileText, count: logs.length },
                { value: 'metrics', label: 'Current Metrics', icon: Database, count: metrics.length },
                { value: 'errors', label: 'Errors + Fixes', icon: AlertCircle, count: dbStats?.errorCount || 0 },
                { value: 'full', label: 'Full Export', icon: Download, count: null, desc: 'Historical data' }
              ].map(type => (
                <button
                  key={type.value}
                  onClick={() => setExportType(type.value)}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    exportType === type.value
                      ? 'border-electric-500 bg-electric-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <type.icon className={`w-5 h-5 mb-2 ${
                    exportType === type.value ? 'text-electric-400' : 'text-slate-400'
                  }`} />
                  <p className="text-sm font-medium text-white">{type.label}</p>
                  {type.count !== null ? (
                    <p className="text-xs text-slate-500">{type.count} records</p>
                  ) : (
                    <p className="text-xs text-slate-500">{type.desc}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Include Options (for full/errors export) */}
          {(exportType === 'full' || exportType === 'errors') && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-400">Include</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:border-white/20">
                  <input
                    type="checkbox"
                    checked={includeResolutions}
                    onChange={(e) => setIncludeResolutions(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/10 text-electric-500 focus:ring-electric-500"
                  />
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white">Error Resolutions</span>
                  <span className="text-xs text-slate-500 ml-auto">Past fixes applied</span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:border-white/20">
                  <input
                    type="checkbox"
                    checked={includePredictions}
                    onChange={(e) => setIncludePredictions(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/10 text-electric-500 focus:ring-electric-500"
                  />
                  <Brain className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-white">Predictions</span>
                  <span className="text-xs text-slate-500 ml-auto">AI insights</span>
                </label>
              </div>
            </div>
          )}

          {/* Format */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-400">Format</label>
            <div className="flex items-center gap-3">
              {['json', 'csv'].map(format => (
                <button
                  key={format}
                  onClick={() => setExportFormat(format)}
                  className={`flex-1 p-3 rounded-xl border transition-all ${
                    exportFormat === format
                      ? 'border-electric-500 bg-electric-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <p className="text-sm font-medium text-white uppercase">{format}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-400">Date Range</label>
            <div className="flex items-center gap-3">
              {[
                { value: 'all', label: 'All Data' },
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' }
              ].map(range => (
                <button
                  key={range.value}
                  onClick={() => setDateRange(range.value)}
                  className={`flex-1 p-3 rounded-xl border transition-all ${
                    dateRange === range.value
                      ? 'border-electric-500 bg-electric-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <p className="text-sm font-medium text-white">{range.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`w-full btn-primary flex items-center justify-center gap-2 py-3 ${
              isExporting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isExporting ? (
              <>
                <div className="spinner" />
                <span>Exporting...</span>
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Export Complete!</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Export Data</span>
              </>
            )}
          </button>
        </div>

        {/* Preview */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Data Preview</h2>

          <div className="bg-black/30 rounded-xl p-4 border border-white/5 h-80 overflow-auto">
            <pre className="text-xs text-slate-300 font-mono">
              {exportType === 'logs' && JSON.stringify(logs.slice(0, 3), null, 2)}
              {exportType === 'metrics' && JSON.stringify(metrics.slice(0, 3), null, 2)}
              {exportType === 'history' && JSON.stringify(
                Object.fromEntries(
                  Object.entries(metricsHistory).slice(0, 2).map(([k, v]) => [k, v.slice(0, 3)])
                ),
                null, 2
              )}
              {exportType === 'errors' && JSON.stringify({
                description: 'Error history with resolutions',
                errors: dbStats?.errorCount || 0,
                resolutions: dbStats?.resolutions || 0,
                includesResolutions: includeResolutions
              }, null, 2)}
              {exportType === 'full' && JSON.stringify({
                summary: {
                  logs: dbStats?.totalLogs || logs.length,
                  errors: dbStats?.errorCount || 0,
                  resolutions: includeResolutions ? (dbStats?.resolutions || 0) : 'excluded',
                  predictions: includePredictions ? (dbStats?.predictions || 0) : 'excluded',
                  metricsHistory: dbStats?.metricsDataPoints || 0
                },
                databaseMode: dbStats?.mode || 'in-memory',
                format: exportFormat,
                dateRange: dateRange
              }, null, 2)}
            </pre>
          </div>

          <div className="mt-4 space-y-2">
            <div className="p-3 bg-white/5 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Calendar className="w-4 h-4" />
                <span>
                  {exportType === 'full' || exportType === 'errors'
                    ? 'Includes historical data from database'
                    : 'Export includes data from current session'}
                </span>
              </div>
            </div>

            {dbStats?.mode === 'supabase' && (
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <History className="w-4 h-4" />
                  <span>Full historical data available via Supabase</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExportPage;