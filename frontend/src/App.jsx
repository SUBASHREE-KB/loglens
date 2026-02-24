import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';

import useSocket from './hooks/useSocket';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import LogsView from './pages/LogsView';
import InsightsPage from './pages/InsightsPage';
import ServiceHealthPage from './pages/ServiceHealthPage';
import IncidentsPage from './pages/IncidentsPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';

function AppShell({ children, connected, metrics }) {
  const location = useLocation();

  // Calculate system stats from metrics
  const systemStats = {
    totalServices: metrics.length,
    healthyServices: metrics.filter(m => m.status === 'healthy').length,
    activeAlerts: metrics.filter(m => m.status === 'error' || m.status === 'warning').length
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar currentPath={location.pathname} systemStats={systemStats} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TopBar */}
        <TopBar connected={connected} />

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  const {
    connected,
    logs,
    metrics,
    currentAnalysis,
    generatedFix,
    isAnalyzing,
    isGeneratingFix,
    notification,
    triggerAnalysis,
    generateFix,
    clearNotification,
    clearAnalysis
  } = useSocket();

  const [metricsHistory, setMetricsHistory] = useState({});
  const [errorHistory, setErrorHistory] = useState([]); // Persists across log buffer rotation

  // Track metrics history
  useEffect(() => {
    if (metrics.length > 0) {
      setMetricsHistory(prev => {
        const updated = { ...prev };
        metrics.forEach(m => {
          if (!updated[m.service]) {
            updated[m.service] = [];
          }
          updated[m.service] = [
            ...updated[m.service],
            {
              timestamp: m.timestamp,
              cpu: m.cpuPercent,
              memory: m.memoryPercent
            }
          ].slice(-60);
        });
        return updated;
      });
    }
  }, [metrics]);

  // Track error history from logs - persists the last 50 unique errors
  useEffect(() => {
    const errorLogs = logs.filter(l => ['ERROR', 'CRITICAL'].includes(l.level));
    if (errorLogs.length === 0) return;
    setErrorHistory(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const newErrors = errorLogs.filter(e => !existingIds.has(e.id));
      if (newErrors.length === 0) return prev;
      return [...prev, ...newErrors].slice(-50); // Keep last 50 unique errors
    });
  }, [logs]);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        clearNotification();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, clearNotification]);

  // Shared props for pages
  const sharedProps = {
    connected,
    logs,
    metrics,
    metricsHistory,
    errorHistory,
    currentAnalysis,
    generatedFix,
    isAnalyzing,
    isGeneratingFix,
    triggerAnalysis,
    generateFix,
    clearAnalysis
  };

  return (
    <BrowserRouter>
      <AppShell connected={connected} metrics={metrics}>
        <Routes>
          <Route path="/" element={<Dashboard {...sharedProps} />} />
          <Route path="/logs" element={<LogsView {...sharedProps} />} />
          <Route path="/insights" element={<InsightsPage {...sharedProps} />} />
          <Route path="/services" element={<ServiceHealthPage {...sharedProps} />} />
          <Route path="/incidents" element={<IncidentsPage {...sharedProps} />} />
          <Route path="/export" element={<ExportPage {...sharedProps} />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;