import React, { useMemo, useState, useEffect } from 'react';
import {
  Zap, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Brain,
  Activity, Server, Clock, AlertCircle, Cpu, HardDrive, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Target, Lightbulb, History,
  RefreshCw, AlertOctagon
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

function InsightsPage({ metrics, metricsHistory, logs }) {
  const [errorTrends, setErrorTrends] = useState(null);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [predictions, setPredictions] = useState([]);

  // Fetch error trends from database
  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const res = await fetch(`${API_URL}/api/database/error-trends?hours=24`);
        if (res.ok) {
          const data = await res.json();
          setErrorTrends(data);

          // Generate predictions based on trends
          generatePredictions(data, metrics);
        }
      } catch (error) {
        console.error('Failed to fetch error trends:', error);
      } finally {
        setLoadingTrends(false);
      }
    };

    fetchTrends();
    const interval = setInterval(fetchTrends, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Generate predictive insights — always replaces previous predictions
  const generatePredictions = (trends, currentMetrics = metrics) => {
    const newPredictions = [];

    if (!trends || !trends.byHour) {
      setPredictions([]); // Clear stale predictions if no data
      return;
    }

    const hourlyData = trends.byHour || [];
    const recentHours = hourlyData.slice(-6);

    // Calculate error rate trend
    if (recentHours.length >= 3) {
      const recentAvg = recentHours.reduce((sum, h) => sum + (h.count || 0), 0) / recentHours.length;
      const olderHours = hourlyData.slice(-12, -6);
      const olderAvg = olderHours.length > 0
        ? olderHours.reduce((sum, h) => sum + (h.count || 0), 0) / olderHours.length
        : recentAvg;

      const changeRate = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

      if (changeRate > 50) {
        newPredictions.push({
          type: 'critical',
          title: 'Error Rate Spike Detected',
          description: `Error rate has increased by ${changeRate.toFixed(0)}% in the last 6 hours. At this rate, you may experience service degradation within 2-4 hours.`,
          timeToFailure: '2-4 hours',
          action: 'Investigate recent deployments and review error logs immediately'
        });
      } else if (changeRate > 20) {
        newPredictions.push({
          type: 'warning',
          title: 'Rising Error Trend',
          description: `Error rate trending upward by ${changeRate.toFixed(0)}%. Monitor closely for the next hour.`,
          timeToFailure: '4-8 hours',
          action: 'Review recent changes and prepare rollback strategy'
        });
      } else if (changeRate < -20) {
        newPredictions.push({
          type: 'positive',
          title: 'Error Rate Decreasing',
          description: `Error rate has decreased by ${Math.abs(changeRate).toFixed(0)}%. System health improving.`,
          timeToFailure: null,
          action: 'Continue monitoring to confirm stability'
        });
      }
    }

    // Service-specific predictions
    if (trends.byService) {
      Object.entries(trends.byService).forEach(([service, data]) => {
        if (data.count > 10 && data.trend === 'increasing') {
          newPredictions.push({
            type: 'warning',
            title: `${service} Requires Attention`,
            description: `${service} has generated ${data.count} errors with an increasing trend. Likely to cause cascading failures if not addressed.`,
            timeToFailure: '1-3 hours',
            action: `Check ${service} logs and resource utilization`
          });
        }
      });
    }

    // Memory/CPU based predictions from current metrics
    const highResourceServices = (currentMetrics || []).filter(m => m.memoryPercent > 80 || m.cpuPercent > 85);
    highResourceServices.forEach(service => {
      if (service.memoryPercent > 80) {
        newPredictions.push({
          type: 'warning',
          title: `Memory Pressure on ${service.service}`,
          description: `Memory usage at ${service.memoryPercent.toFixed(1)}%. Risk of OOM (Out of Memory) crash if load increases.`,
          timeToFailure: service.memoryPercent > 90 ? '30 min - 1 hour' : '2-4 hours',
          action: 'Consider restarting the service or scaling horizontally'
        });
      }
    });

    setPredictions(newPredictions);
  };

  // Calculate detailed analytics
  const analytics = useMemo(() => {
    const errorLogs = logs.filter(l => ['ERROR', 'CRITICAL'].includes(l.level));
    const warningLogs = logs.filter(l => l.level === 'WARN');
    const infoLogs = logs.filter(l => l.level === 'INFO');

    // Health score calculation
    const healthScore = Math.max(0, 100 - (errorLogs.length * 5) - (warningLogs.length * 2));

    // Service-wise error analysis
    const serviceErrors = {};
    const serviceWarnings = {};
    errorLogs.forEach(log => {
      const service = log.service || 'unknown';
      serviceErrors[service] = (serviceErrors[service] || 0) + 1;
    });
    warningLogs.forEach(log => {
      const service = log.service || 'unknown';
      serviceWarnings[service] = (serviceWarnings[service] || 0) + 1;
    });

    // Find most problematic service
    const sortedByErrors = Object.entries(serviceErrors).sort((a, b) => b[1] - a[1]);
    const mostProblematicService = sortedByErrors[0];

    // Error patterns - group by message similarity
    const errorPatterns = {};
    errorLogs.forEach(log => {
      // Extract error type from message
      const pattern = log.message?.split(':')[0]?.trim() || 'Unknown Error';
      errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
    });
    const topErrorPatterns = Object.entries(errorPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Recent activity timeline (last hour simulation)
    const now = Date.now();
    const recentErrors = errorLogs.filter(l => {
      const logTime = new Date(l.timestamp).getTime();
      return now - logTime < 3600000; // Last hour
    });

    // CPU/Memory trends
    const avgCpu = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.cpuPercent, 0) / metrics.length
      : 0;
    const avgMemory = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.memoryPercent, 0) / metrics.length
      : 0;

    // Services at risk (high resource usage)
    const servicesAtRisk = metrics.filter(m => m.cpuPercent > 70 || m.memoryPercent > 70);

    return {
      healthScore,
      errorCount: errorLogs.length,
      warningCount: warningLogs.length,
      infoCount: infoLogs.length,
      serviceErrors,
      serviceWarnings,
      mostProblematicService,
      topErrorPatterns,
      recentErrors,
      avgCpu,
      avgMemory,
      servicesAtRisk,
      totalServices: metrics.length,
      healthyServices: metrics.filter(m => m.cpuPercent < 80 && m.memoryPercent < 80).length
    };
  }, [logs, metrics]);

  const formatServiceName = (name) => {
    return name
      ?.replace('kubewhisper-', '')
      ?.replace('loglens-', '')
      ?.split('-')
      ?.map(word => word.charAt(0).toUpperCase() + word.slice(1))
      ?.join(' ') || 'Unknown';
  };

  const getHealthStatus = (score) => {
    if (score >= 80) return { label: 'Excellent', color: 'cyber-green', icon: CheckCircle };
    if (score >= 60) return { label: 'Good', color: 'cyber-green', icon: CheckCircle };
    if (score >= 40) return { label: 'Fair', color: 'cyber-yellow', icon: AlertTriangle };
    return { label: 'Critical', color: 'cyber-red', icon: AlertCircle };
  };

  const healthStatus = getHealthStatus(analytics.healthScore);
  const HealthIcon = healthStatus.icon;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Brain className="w-7 h-7 text-cyan-400" />
            AI Insights
          </h1>
          <p className="text-slate-400 mt-1">Intelligent analysis based on real-time logs and metrics</p>
        </div>
      </div>

      {/* Health Score Card */}
      <div className="glass-card p-6 border-l-4 border-cyan-500">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-cyan-500 flex items-center justify-center">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">System Health Score</h2>
              <p className="text-sm text-slate-400">Based on {logs.length} log entries analyzed</p>
            </div>
          </div>

          <div className="text-right flex items-center gap-4">
            <div>
              <span className={`text-5xl font-bold text-${healthStatus.color}`}>
                {analytics.healthScore}
              </span>
              <span className="text-2xl text-slate-400">/100</span>
            </div>
            <div className={`p-3 rounded-xl bg-${healthStatus.color}/20`}>
              <HealthIcon className={`w-8 h-8 text-${healthStatus.color}`} />
            </div>
          </div>
        </div>

        {/* Health Bar */}
        <div className="h-3 rounded-full bg-white/10 overflow-hidden mb-6">
          <div
            className={`h-full rounded-full transition-all duration-1000 bg-${healthStatus.color}`}
            style={{ width: `${analytics.healthScore}%` }}
          />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">Services</span>
            </div>
            <p className="text-2xl font-bold text-white">{analytics.healthyServices}/{analytics.totalServices}</p>
            <p className="text-xs text-cyber-green">Healthy</p>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-cyber-red" />
              <span className="text-xs text-slate-400">Errors</span>
            </div>
            <p className="text-2xl font-bold text-cyber-red">{analytics.errorCount}</p>
            <p className="text-xs text-slate-400">Total detected</p>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-electric-400" />
              <span className="text-xs text-slate-400">Avg CPU</span>
            </div>
            <p className="text-2xl font-bold text-white">{analytics.avgCpu.toFixed(1)}%</p>
            <p className={`text-xs ${analytics.avgCpu > 70 ? 'text-cyber-yellow' : 'text-cyber-green'}`}>
              {analytics.avgCpu > 70 ? 'High usage' : 'Normal'}
            </p>
          </div>
          <div className="p-4 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">Avg Memory</span>
            </div>
            <p className="text-2xl font-bold text-white">{analytics.avgMemory.toFixed(1)}%</p>
            <p className={`text-xs ${analytics.avgMemory > 70 ? 'text-cyber-yellow' : 'text-cyber-green'}`}>
              {analytics.avgMemory > 70 ? 'High usage' : 'Stable'}
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Error Pattern Analysis */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyber-red/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-cyber-red" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Error Pattern Analysis</h2>
              <p className="text-xs text-slate-400">Most common error types detected</p>
            </div>
          </div>

          {analytics.topErrorPatterns.length > 0 ? (
            <div className="space-y-3">
              {analytics.topErrorPatterns.map(([pattern, count], index) => (
                <div key={index} className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white font-medium truncate flex-1">
                      {pattern.length > 40 ? pattern.substring(0, 40) + '...' : pattern}
                    </span>
                    <span className="badge badge-error ml-2">{count}x</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyber-red/60"
                      style={{ width: `${(count / analytics.errorCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-cyber-green mx-auto mb-3" />
              <p className="text-white font-medium">No Error Patterns</p>
              <p className="text-sm text-slate-400">Your system is running error-free</p>
            </div>
          )}
        </div>

        {/* Service Health Breakdown */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Service Health Breakdown</h2>
              <p className="text-xs text-slate-400">Issues by service</p>
            </div>
          </div>

          {Object.keys(analytics.serviceErrors).length > 0 || Object.keys(analytics.serviceWarnings).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(analytics.serviceErrors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([service, errors]) => (
                <div key={service} className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${errors > 2 ? 'bg-cyber-red' : 'bg-cyber-yellow'}`} />
                      <span className="text-sm text-white font-medium">{formatServiceName(service)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-error text-xs">{errors} errors</span>
                      {analytics.serviceWarnings[service] && (
                        <span className="badge badge-warning text-xs">{analytics.serviceWarnings[service]} warns</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-cyber-green mx-auto mb-3" />
              <p className="text-white font-medium">All Services Healthy</p>
              <p className="text-sm text-slate-400">No service-specific issues detected</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyber-yellow/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-cyber-yellow" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">AI Recommendations</h2>
            <p className="text-xs text-slate-400">Actionable insights based on current system state</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Critical Alert */}
          {analytics.mostProblematicService && analytics.mostProblematicService[1] > 2 && (
            <div className="p-4 rounded-xl bg-cyber-red/10 border border-cyber-red/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-cyber-red flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-cyber-red mb-1">Critical: High Error Rate</h3>
                  <p className="text-xs text-slate-300">
                    <strong>{formatServiceName(analytics.mostProblematicService[0])}</strong> has {analytics.mostProblematicService[1]} errors.
                    Investigate immediately to prevent cascading failures.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Resource Warning */}
          {analytics.servicesAtRisk.length > 0 && (
            <div className="p-4 rounded-xl bg-cyber-yellow/10 border border-cyber-yellow/30">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-cyber-yellow flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-cyber-yellow mb-1">Resource Alert</h3>
                  <p className="text-xs text-slate-300">
                    {analytics.servicesAtRisk.length} service(s) showing high resource usage.
                    Consider scaling or optimizing to prevent performance degradation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Pattern Alert */}
          {analytics.topErrorPatterns.length > 0 && analytics.topErrorPatterns[0][1] > 3 && (
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <div className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-cyan-400 mb-1">Recurring Error Pattern</h3>
                  <p className="text-xs text-slate-300">
                    "{analytics.topErrorPatterns[0][0].substring(0, 30)}..." occurred {analytics.topErrorPatterns[0][1]} times.
                    This may indicate a systematic issue requiring root cause analysis.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* All Good */}
          {analytics.healthScore >= 80 && analytics.errorCount === 0 && (
            <div className="p-4 rounded-xl bg-cyber-green/10 border border-cyber-green/30">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-cyber-green flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-cyber-green mb-1">System Optimal</h3>
                  <p className="text-xs text-slate-300">
                    All systems are operating within normal parameters.
                    Continue monitoring for any changes in performance patterns.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* General Optimization */}
          {analytics.healthScore < 80 && analytics.errorCount > 0 && (
            <div className="p-4 rounded-xl bg-electric-500/10 border border-electric-500/30">
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-electric-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-electric-400 mb-1">Optimization Opportunity</h3>
                  <p className="text-xs text-slate-300">
                    Address the {analytics.errorCount} active errors and {analytics.warningCount} warnings
                    to improve system health score by up to {Math.min(30, analytics.errorCount * 5)}%.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity Summary */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-electric-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-electric-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Activity Summary</h2>
            <p className="text-xs text-slate-400">Log distribution by level</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-slate-500/10 rounded-xl border border-slate-500/20">
            <p className="text-3xl font-bold text-slate-300">{analytics.infoCount}</p>
            <p className="text-xs text-slate-400 mt-1">Info Logs</p>
          </div>
          <div className="text-center p-4 bg-cyber-yellow/10 rounded-xl border border-cyber-yellow/20">
            <p className="text-3xl font-bold text-cyber-yellow">{analytics.warningCount}</p>
            <p className="text-xs text-slate-400 mt-1">Warnings</p>
          </div>
          <div className="text-center p-4 bg-cyber-red/10 rounded-xl border border-cyber-red/20">
            <p className="text-3xl font-bold text-cyber-red">{analytics.errorCount}</p>
            <p className="text-xs text-slate-400 mt-1">Errors</p>
          </div>
        </div>
      </div>

      {/* Predictive Insights */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Predictive Insights</h2>
              <p className="text-xs text-slate-400">AI-powered failure predictions based on historical data</p>
            </div>
          </div>
          {loadingTrends && (
            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          )}
        </div>

        {predictions.length > 0 ? (
          <div className="space-y-4">
            {predictions.map((prediction, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl border ${
                  prediction.type === 'critical'
                    ? 'bg-cyber-red/10 border-cyber-red/30'
                    : prediction.type === 'warning'
                    ? 'bg-cyber-yellow/10 border-cyber-yellow/30'
                    : 'bg-cyber-green/10 border-cyber-green/30'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    prediction.type === 'critical'
                      ? 'bg-cyber-red/20'
                      : prediction.type === 'warning'
                      ? 'bg-cyber-yellow/20'
                      : 'bg-cyber-green/20'
                  }`}>
                    {prediction.type === 'critical' ? (
                      <AlertOctagon className="w-5 h-5 text-cyber-red" />
                    ) : prediction.type === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-cyber-yellow" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-cyber-green" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`text-sm font-semibold ${
                        prediction.type === 'critical'
                          ? 'text-cyber-red'
                          : prediction.type === 'warning'
                          ? 'text-cyber-yellow'
                          : 'text-cyber-green'
                      }`}>
                        {prediction.title}
                      </h3>
                      {prediction.timeToFailure && (
                        <span className="badge badge-error text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          Est. {prediction.timeToFailure}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{prediction.description}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Lightbulb className="w-3 h-3" />
                      <span><strong>Recommended:</strong> {prediction.action}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loadingTrends ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
            <p className="text-slate-400">Analyzing historical data...</p>
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-cyber-green mx-auto mb-3" />
            <p className="text-white font-medium">No Predicted Issues</p>
            <p className="text-sm text-slate-400">
              System is stable with no concerning patterns detected.
              Continue monitoring for any changes.
            </p>
          </div>
        )}
      </div>

      {/* Historical Error Trends */}
      {errorTrends && errorTrends.byHour && errorTrends.byHour.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-electric-500/20 flex items-center justify-center">
              <History className="w-5 h-5 text-electric-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">24-Hour Error Trend</h2>
              <p className="text-xs text-slate-400">Hourly error distribution from database</p>
            </div>
          </div>

          <div className="h-32 flex items-end gap-1">
            {errorTrends.byHour.slice(-24).map((hour, index) => {
              const maxCount = Math.max(...errorTrends.byHour.map(h => h.count || 0), 1);
              const height = ((hour.count || 0) / maxCount) * 100;
              const isRecent = index >= errorTrends.byHour.length - 3;

              return (
                <div
                  key={index}
                  className="flex-1 relative group"
                  title={`${hour.hour || index}: ${hour.count || 0} errors`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      isRecent ? 'bg-cyan-500' : 'bg-slate-600'
                    } hover:opacity-80`}
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-navy-800 px-2 py-1 rounded text-xs text-white whitespace-nowrap z-10">
                    {hour.count || 0} errors
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>24h ago</span>
            <span>Now</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default InsightsPage;