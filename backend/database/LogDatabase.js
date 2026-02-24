/**
 * Log Database Manager
 * Uses Supabase (PostgreSQL) for persistence with in-memory fallback
 */

const crypto = require('crypto');
const { initializeSupabase, testConnection, getClient, getConnectionStatus } = require('./supabase');

class LogDatabase {
  constructor() {
    this.isReady = false;
    this.useSupabase = false;
    this.retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 7;

    // In-memory storage (always available as fallback)
    this.logs = [];
    this.errors = [];
    this.predictions = [];
    this.errorResolutions = [];
    this.metricsHistory = [];
    this.hashSet = new Set();
    this.errorHashSet = new Set();

    // Initialize Supabase
    this.initialize();
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      const client = initializeSupabase();
      if (client) {
        const connected = await testConnection();
        this.useSupabase = connected;
        if (connected) {
          console.log('[LogDatabase] Using Supabase for persistence');
        }
      }
    } catch (error) {
      console.log('[LogDatabase] Supabase not available:', error.message);
    }

    this.isReady = true;
    console.log('[LogDatabase] Ready (mode: ' + (this.useSupabase ? 'Supabase' : 'in-memory') + ')');
  }

  /**
   * Generate hash for log deduplication
   */
  generateLogHash(log) {
    const normalizedMessage = (log.message || '')
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8,}/gi, 'H')
      .substring(0, 200);

    const hashInput = `${log.service}|${log.level}|${normalizedMessage}`;
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Insert a log entry
   * @returns {boolean} true if new log, false if duplicate
   */
  async insertLog(log) {
    if (!log || !log.service) return false;

    const hash = this.generateLogHash(log);

    // Check in-memory hash set first (fast deduplication)
    if (this.hashSet.has(hash)) {
      // Update duplicate count
      if (this.useSupabase) {
        try {
          const supabase = getClient();
          await supabase
            .from('logs')
            .update({ duplicate_count: supabase.sql`duplicate_count + 1` })
            .eq('hash', hash);
        } catch (e) {
          // Ignore update errors
        }
      }
      return false;
    }

    // Add to in-memory
    this.hashSet.add(hash);
    const logEntry = {
      id: this.logs.length + 1,
      hash,
      timestamp: log.timestamp || new Date().toISOString(),
      service: log.service,
      level: log.level || 'INFO',
      message: log.message,
      duplicate_count: 1
    };
    this.logs.push(logEntry);

    // Keep in-memory size manageable
    if (this.logs.length > 5000) {
      const removed = this.logs.shift();
      this.hashSet.delete(removed.hash);
    }

    // Persist to Supabase
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        await supabase.from('logs').insert({
          hash,
          timestamp: logEntry.timestamp,
          service: log.service,
          level: logEntry.level,
          message: log.message,
          duplicate_count: 1
        });
      } catch (e) {
        // Log already exists or other error - ignore
      }
    }

    return true;
  }

  /**
   * Track an error for correlation
   */
  async trackError(log) {
    if (!log || !log.service) return;

    const hash = this.generateLogHash(log);
    const now = new Date().toISOString();

    if (this.errorHashSet.has(hash)) {
      // Update occurrence count
      const existing = this.errors.find(e => e.hash === hash);
      if (existing) {
        existing.occurrence_count++;
        existing.last_seen = now;
      }

      // Update in Supabase
      if (this.useSupabase) {
        try {
          const supabase = getClient();
          await supabase
            .from('errors')
            .update({
              occurrence_count: existing?.occurrence_count || 1,
              last_seen: now
            })
            .eq('error_hash', hash);
        } catch (e) {
          // Ignore update errors
        }
      }
      return;
    }

    this.errorHashSet.add(hash);
    const errorEntry = {
      id: this.errors.length + 1,
      hash,
      error_hash: hash,
      first_seen: now,
      last_seen: now,
      service: log.service,
      message: log.message,
      stack_trace: log.stackTrace || null,
      occurrence_count: 1,
      status: 'new'
    };
    this.errors.push(errorEntry);

    // Keep errors manageable
    if (this.errors.length > 500) {
      const removed = this.errors.shift();
      this.errorHashSet.delete(removed.hash);
    }

    // Persist to Supabase
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        await supabase.from('errors').insert({
          error_hash: hash,
          first_seen: now,
          last_seen: now,
          service: log.service,
          message: log.message,
          stack_trace: log.stackTrace || null,
          occurrence_count: 1,
          status: 'new'
        });
      } catch (e) {
        // Error already exists or other error - ignore
      }
    }
  }

  /**
   * Store error resolution for learning
   */
  async storeErrorResolution(resolution) {
    const entry = {
      id: this.errorResolutions.length + 1,
      error_hash: resolution.errorHash,
      error_message: resolution.errorMessage,
      root_cause: resolution.rootCause,
      fix_applied: resolution.fixApplied,
      fix_description: resolution.fixDescription,
      service: resolution.service,
      file_path: resolution.filePath,
      resolution_time_seconds: resolution.resolutionTime,
      was_successful: resolution.wasSuccessful !== false,
      resolved_by: resolution.resolvedBy || 'user',
      created_at: new Date().toISOString()
    };

    this.errorResolutions.push(entry);

    // Keep in-memory manageable
    if (this.errorResolutions.length > 200) {
      this.errorResolutions.shift();
    }

    // Persist to Supabase
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        await supabase.from('error_resolutions').insert(entry);
      } catch (e) {
        console.error('[LogDatabase] Failed to store resolution:', e.message);
      }
    }

    return entry;
  }

  /**
   * Get similar past resolutions for an error
   */
  async getSimilarResolutions(errorMessage, service, limit = 5) {
    // In-memory search
    let results = [...this.errorResolutions];

    if (service) {
      results = results.filter(r => r.service === service);
    }

    // Simple similarity - check if error messages have common words
    const errorWords = new Set(
      errorMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );

    results = results
      .map(r => {
        const rWords = new Set(
          (r.error_message || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
        );
        const intersection = [...errorWords].filter(w => rWords.has(w));
        return { ...r, similarity: intersection.length };
      })
      .filter(r => r.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    // If Supabase available, also query from database
    if (this.useSupabase && results.length < limit) {
      try {
        const supabase = getClient();
        const { data } = await supabase
          .from('error_resolutions')
          .select('*')
          .eq('service', service)
          .eq('was_successful', true)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (data) {
          results = [...results, ...data].slice(0, limit);
        }
      } catch (e) {
        // Ignore query errors
      }
    }

    return results;
  }

  /**
   * Store metrics history
   */
  async storeMetrics(metrics) {
    const entry = {
      id: this.metricsHistory.length + 1,
      timestamp: new Date().toISOString(),
      service: metrics.service,
      cpu_percent: metrics.cpu,
      memory_percent: metrics.memory,
      memory_usage_mb: metrics.memoryUsage,
      memory_limit_mb: metrics.memoryLimit,
      network_rx_bytes: metrics.networkRx,
      network_tx_bytes: metrics.networkTx,
      container_status: metrics.status
    };

    this.metricsHistory.push(entry);

    // Keep last 1000 metrics per service in memory
    if (this.metricsHistory.length > 5000) {
      this.metricsHistory.shift();
    }

    // Persist to Supabase
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        await supabase.from('metrics_history').insert(entry);
      } catch (e) {
        // Ignore insert errors
      }
    }

    return entry;
  }

  /**
   * Get metrics history for a service
   */
  async getMetricsHistory(service, hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    // In-memory results
    let results = this.metricsHistory.filter(m => {
      if (service && m.service !== service) return false;
      return new Date(m.timestamp) >= cutoff;
    });

    // Query Supabase if available
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        let query = supabase
          .from('metrics_history')
          .select('*')
          .gte('timestamp', cutoff.toISOString())
          .order('timestamp', { ascending: true });

        if (service) {
          query = query.eq('service', service);
        }

        const { data } = await query.limit(1000);
        if (data && data.length > 0) {
          results = data;
        }
      } catch (e) {
        // Use in-memory results
      }
    }

    return results;
  }

  /**
   * Store a prediction
   */
  async storePrediction(prediction) {
    const entry = {
      id: this.predictions.length + 1,
      prediction_type: prediction.type,
      service: prediction.service,
      predicted_issue: prediction.issue,
      confidence: prediction.confidence,
      time_horizon: prediction.timeHorizon,
      based_on_data: JSON.stringify(prediction.basedOn || {}),
      created_at: new Date().toISOString(),
      status: 'active'
    };

    this.predictions.push(entry);

    // Keep predictions manageable
    if (this.predictions.length > 100) {
      this.predictions.shift();
    }

    // Persist to Supabase
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        await supabase.from('predictions').insert(entry);
      } catch (e) {
        // Ignore insert errors
      }
    }

    return entry;
  }

  /**
   * Get active predictions
   */
  async getActivePredictions(service = null) {
    // Expire in-memory predictions older than 2 hours
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    this.predictions = this.predictions.filter(p =>
      p.status !== 'active' || new Date(p.created_at).getTime() > twoHoursAgo
    );

    // Deduplicate: keep only the most recent prediction per type+service combo
    const seen = new Map();
    const deduped = [];
    for (let i = this.predictions.length - 1; i >= 0; i--) {
      const p = this.predictions[i];
      const key = `${p.prediction_type}|${p.service}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        deduped.unshift(p);
      }
    }
    this.predictions = deduped;

    let results = this.predictions.filter(p => p.status === 'active');

    if (service) {
      results = results.filter(p => p.service === service);
    }

    // Query Supabase if available
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        let query = supabase
          .from('predictions')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (service) {
          query = query.eq('service', service);
        }

        const { data } = await query.limit(50);
        if (data && data.length > 0) {
          results = data;
        }
      } catch (e) {
        // Use in-memory results
      }
    }

    return results;
  }

  /**
   * Search logs
   */
  async searchLogs(options = {}) {
    const { query, service, level, startDate, endDate, limit = 100, offset = 0 } = options;

    // In-memory search first
    let results = [...this.logs];

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(l =>
        l.message?.toLowerCase().includes(q) ||
        l.service?.toLowerCase().includes(q)
      );
    }

    if (service) {
      results = results.filter(l => l.service === service);
    }

    if (level) {
      results = results.filter(l => l.level === level);
    }

    if (startDate) {
      results = results.filter(l => new Date(l.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      results = results.filter(l => new Date(l.timestamp) <= new Date(endDate));
    }

    // Query Supabase for more results if available
    if (this.useSupabase && results.length < limit) {
      try {
        const supabase = getClient();
        let dbQuery = supabase
          .from('logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .range(offset, offset + limit - 1);

        if (service) {
          dbQuery = dbQuery.eq('service', service);
        }

        if (level) {
          dbQuery = dbQuery.eq('level', level);
        }

        if (query) {
          dbQuery = dbQuery.ilike('message', `%${query}%`);
        }

        if (startDate) {
          dbQuery = dbQuery.gte('timestamp', startDate);
        }

        if (endDate) {
          dbQuery = dbQuery.lte('timestamp', endDate);
        }

        const { data } = await dbQuery;
        if (data && data.length > 0) {
          results = data;
        }
      } catch (e) {
        // Use in-memory results
      }
    }

    return results.slice(offset, offset + limit).reverse();
  }

  /**
   * Find similar errors
   */
  async findSimilarErrors(message, service, limit = 10) {
    let results = [...this.errors];

    if (service) {
      results = results.filter(e => e.service === service);
    }

    // Query Supabase if available
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        let query = supabase
          .from('errors')
          .select('*')
          .order('occurrence_count', { ascending: false })
          .limit(limit);

        if (service) {
          query = query.eq('service', service);
        }

        const { data } = await query;
        if (data && data.length > 0) {
          results = data;
        }
      } catch (e) {
        // Use in-memory results
      }
    }

    return results
      .sort((a, b) => b.occurrence_count - a.occurrence_count)
      .slice(0, limit);
  }

  /**
   * Get error trends by hour
   */
  async getErrorTrends(hours = 24) {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    const byHour = [];
    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = now - (i + 1) * hourMs;
      const hourEnd = now - i * hourMs;

      const count = this.errors.filter(e => {
        const ts = new Date(e.last_seen).getTime();
        return ts >= hourStart && ts < hourEnd;
      }).length;

      byHour.push({
        hour: new Date(hourEnd).toISOString(),
        count
      });
    }

    // Service breakdown
    const byService = {};
    this.errors.forEach(e => {
      if (!byService[e.service]) {
        byService[e.service] = { count: 0, trend: 'stable' };
      }
      byService[e.service].count++;
    });

    return { byHour, byService };
  }

  /**
   * Get all errors for export
   */
  async getAllErrors(options = {}) {
    const { startDate, endDate, service, status, limit = 1000 } = options;

    let results = [...this.errors];

    if (service) {
      results = results.filter(e => e.service === service);
    }

    if (status) {
      results = results.filter(e => e.status === status);
    }

    if (startDate) {
      results = results.filter(e => new Date(e.first_seen) >= new Date(startDate));
    }

    if (endDate) {
      results = results.filter(e => new Date(e.first_seen) <= new Date(endDate));
    }

    // Query Supabase for comprehensive results
    if (this.useSupabase) {
      try {
        const supabase = getClient();
        let query = supabase
          .from('errors')
          .select('*')
          .order('last_seen', { ascending: false })
          .limit(limit);

        if (service) {
          query = query.eq('service', service);
        }

        if (status) {
          query = query.eq('status', status);
        }

        if (startDate) {
          query = query.gte('first_seen', startDate);
        }

        if (endDate) {
          query = query.lte('first_seen', endDate);
        }

        const { data } = await query;
        if (data && data.length > 0) {
          results = data;
        }
      } catch (e) {
        // Use in-memory results
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get database statistics
   */
  getStats() {
    const connStatus = getConnectionStatus();

    return {
      totalLogs: this.logs.length,
      errorCount: this.errors.length,
      uniquePatterns: this.hashSet.size,
      resolutions: this.errorResolutions.length,
      predictions: this.predictions.length,
      metricsDataPoints: this.metricsHistory.length,
      mode: this.useSupabase ? 'supabase' : 'in-memory',
      supabase: connStatus,
      ready: this.isReady,
      retentionDays: this.retentionDays
    };
  }

  /**
   * Update error status
   */
  async updateErrorStatus(errorHash, status) {
    const error = this.errors.find(e => e.hash === errorHash || e.error_hash === errorHash);
    if (error) {
      error.status = status;
    }

    if (this.useSupabase) {
      try {
        const supabase = getClient();
        await supabase
          .from('errors')
          .update({ status })
          .eq('error_hash', errorHash);
      } catch (e) {
        // Ignore update errors
      }
    }
  }

  /**
   * Manual cleanup
   */
  async cleanup() {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoff).toISOString();

    // Clean in-memory
    this.logs = this.logs.filter(l => new Date(l.timestamp).getTime() > cutoff);
    this.hashSet = new Set(this.logs.map(l => l.hash));

    this.errors = this.errors.filter(e => new Date(e.last_seen).getTime() > cutoff);
    this.errorHashSet = new Set(this.errors.map(e => e.hash || e.error_hash));

    this.metricsHistory = this.metricsHistory.filter(m => new Date(m.timestamp).getTime() > cutoff);

    // Clean Supabase
    if (this.useSupabase) {
      try {
        const supabase = getClient();

        await supabase.from('logs').delete().lt('timestamp', cutoffDate);
        await supabase.from('metrics_history').delete().lt('timestamp', cutoffDate);

        console.log('[LogDatabase] Supabase cleanup complete');
      } catch (e) {
        console.error('[LogDatabase] Supabase cleanup error:', e.message);
      }
    }

    console.log(`[LogDatabase] Cleanup complete: ${this.logs.length} logs, ${this.errors.length} errors`);
  }
}

// Singleton instance
const logDatabase = new LogDatabase();

module.exports = logDatabase;