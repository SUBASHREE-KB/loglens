import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  TrendingUp,
  Zap,
  Plus,
  ArrowRight,
  BarChart3
} from 'lucide-react';

import ServiceCard from '../components/ServiceCard';
import RecentErrors from '../components/RecentErrors';
import SystemOverview from '../components/SystemOverview';
import PredictiveInsights from '../components/PredictiveInsights';
import ErrorPanel from '../components/ErrorPanel';
import Settings from '../components/Settings';

function Dashboard({connected,
  logs,
  metrics,
  metricsHistory,
  currentAnalysis,
  generatedFix,
  isAnalyzing,
  isGeneratingFix,
  triggerAnalysis,
  generateFix,
  clearAnalysis, errorHistory = []}) {
  const navigate = useNavigate();
  const [showErrorPanel, setShowErrorPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Show error panel when analysis starts or completes
  useEffect(() => {
    if (currentAnalysis || isAnalyzing) {
      setShowErrorPanel(true);
    }
  }, [currentAnalysis, isAnalyzing]);

  // Handle error click
  const handleErrorClick = (errorLog) => {
    triggerAnalysis(errorLog.id);
    setShowErrorPanel(true);
  };

  // Handle dismiss panel
  const handleDismissPanel = () => {
    setShowErrorPanel(false);
    clearAnalysis();
  };

  // Get error logs
  // Use persistent errorHistory (survives log buffer rotation) — fall back to live logs if not provided
  const errorLogs = (errorHistory.length > 0 ? errorHistory : logs.filter(l => ['ERROR', 'CRITICAL'].includes(l.level)))
    .slice(-10).reverse();
  const errorCount = errorLogs.length;

  // Get unique services from metrics
  const services = metrics.map(m => ({
    name: m.service,
    status: m.cpuPercent > 80 || m.memoryPercent > 80 ? 'warning' : 'healthy',
    cpu: m.cpuPercent,
    memory: m.memoryPercent,
    errors: logs.filter(l => l.service === m.service && ['ERROR', 'CRITICAL'].includes(l.level)).length,
    history: metricsHistory[m.service] || []
  }));

  // Calculate summary stats
  const avgCpu = services.length > 0
    ? (services.reduce((sum, s) => sum + s.cpu, 0) / services.length).toFixed(1)
    : 0;
  const avgMemory = services.length > 0
    ? (services.reduce((sum, s) => sum + s.memory, 0) / services.length).toFixed(1)
    : 0;
  const totalErrors = logs.filter(l => ['ERROR', 'CRITICAL'].includes(l.level)).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Services */}
        <div className="metric-card group relative overflow-hidden border-l-4 border-cyan-500">
          <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center ring-1 ring-cyan-500/30">
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Active Services</p>
                <span className="text-xs text-cyan-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Live
                </span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{services.length}</p>
          </div>
        </div>

        {/* Average CPU */}
        <div className="metric-card group relative overflow-hidden border-l-4 border-cyber-green">
          <div className="absolute inset-0 bg-gradient-to-br from-cyber-green/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyber-green/20 flex items-center justify-center ring-1 ring-cyber-green/30">
                <Cpu className="w-5 h-5 text-cyber-green" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Avg CPU Usage</p>
                <span className="text-xs text-cyber-green flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Normal
                </span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{avgCpu}<span className="text-lg text-slate-400">%</span></p>
          </div>
        </div>

        {/* Average Memory */}
        <div className="metric-card group relative overflow-hidden border-l-4 border-cyan-500">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center ring-1 ring-cyan-500/30">
                <HardDrive className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Avg Memory</p>
                <span className="text-xs text-cyan-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Stable
                </span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{avgMemory}<span className="text-lg text-slate-400">%</span></p>
          </div>
        </div>

        {/* Error Count */}
        <div className={`metric-card group relative overflow-hidden border-l-4 ${totalErrors > 0 ? 'border-cyber-red' : 'border-cyber-green'}`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${totalErrors > 0 ? 'from-cyber-red/10' : 'from-cyber-green/10'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${
                totalErrors > 0
                  ? 'bg-cyber-red/20 ring-cyber-red/30'
                  : 'bg-cyber-green/20 ring-cyber-green/30'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${totalErrors > 0 ? 'text-cyber-red' : 'text-cyber-green'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Total Errors</p>
                <span className={`text-xs flex items-center gap-1 ${totalErrors > 0 ? 'text-cyber-red' : 'text-cyber-green'}`}>
                  {totalErrors > 0 ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyber-red animate-pulse" />
                      Attention
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyber-green" />
                      All Clear
                    </>
                  )}
                </span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{totalErrors}</p>
          </div>
        </div>
      </div>

      {/* Service Health Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Service Health</h2>
          </div>
          <button
            onClick={() => navigate('/services')}
            className="btn-glass flex items-center gap-2 text-sm py-2 px-4"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.slice(0, 3).map((service) => (
            <ServiceCard
              key={service.name}
              service={service}
              onClick={() => navigate('/services')}
            />
          ))}

          {/* Add New Service Card */}
          <button
            onClick={() => setShowSettings(true)}
            className="glass-card glass-card-hover flex flex-col items-center justify-center p-6 min-h-[180px] group border-dashed"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3 group-hover:border-electric-400/50 group-hover:bg-electric-500/10 transition-all">
              <Plus className="w-5 h-5 text-slate-500 group-hover:text-electric-400" />
            </div>
            <span className="text-slate-500 text-sm group-hover:text-white transition-colors">Add Service</span>
          </button>
        </div>
      </section>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Errors */}
        <section className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-cyber-red" />
              <h2 className="text-lg font-semibold text-white">Recent Errors</h2>
              {errorCount > 0 && (
                <span className="badge badge-error">{errorCount}</span>
              )}
            </div>
            <button
              onClick={() => navigate('/logs')}
              className="text-sm text-electric-400 hover:text-electric-300 transition-colors"
            >
              View All
            </button>
          </div>

          <RecentErrors
            errors={errorLogs}
            onAnalyze={handleErrorClick}
          />
        </section>

        {/* Predictive Insights */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-cyber-yellow" />
            <h2 className="text-lg font-semibold text-white">AI Insights</h2>
          </div>

          <PredictiveInsights
            metrics={metrics}
            metricsHistory={metricsHistory}
            logs={logs}
          />
        </section>
      </div>

      {/* System Overview */}
      <section className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-white">System Overview</h2>
          <span className="text-xs text-slate-500">(Last 5 minutes)</span>
        </div>

        <SystemOverview
          metrics={metrics}
          metricsHistory={metricsHistory}
        />
      </section>

      {/* Error Panel Drawer */}
      {showErrorPanel && (
        <ErrorPanel
          analysis={currentAnalysis}
          generatedFix={generatedFix}
          isAnalyzing={isAnalyzing}
          isGeneratingFix={isGeneratingFix}
          onGenerateFix={generateFix}
          onDismiss={handleDismissPanel}
        />
      )}

      {/* Settings Modal */}
      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

export default Dashboard;