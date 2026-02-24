/**
 * Analyzer Agent
 * Uses LangChain + Gemini for AI-powered root cause analysis
 */

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PromptTemplate } = require('@langchain/core/prompts');

class AnalyzerAgent {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[AnalyzerAgent] No API key provided - AI analysis will be disabled');
      this.model = null;
      return;
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: 'gemini-2.5-flash',  // Use Flash for faster responses
      temperature: 0.2,
      maxOutputTokens: 4096  // Increased to prevent JSON truncation
    });

    this.timeout = 60000; // 60 second timeout (Gemini can be slow)

    this.promptTemplate = PromptTemplate.fromTemplate(`
You are a senior DevOps engineer and expert at analyzing microservice failures.
Your goal is to provide SPECIFIC, ACTIONABLE analysis based on the actual log data provided.

IMPORTANT RULES:
1. NEVER use generic phrases like "Check logs" or "Review configuration"
2. ALWAYS reference specific error messages from the logs
3. Identify the EXACT function, file, or endpoint mentioned in errors
4. Provide concrete, actionable recommendations
5. If you see a stack trace, identify the specific line and function
6. Quote actual error messages when relevant

Analyze these correlated logs from multiple services:

{logs}

Error Context:
- Primary Service Affected: {originService}
- Cascade to Services: {affectedServices}
- Error Classifications: {errorTypes}
- Key Error Messages: {errorMessages}

REQUIRED ANALYSIS:

1. ROOT CAUSE IDENTIFICATION:
   - What is the specific technical failure?
   - Quote the relevant error message
   - Identify the failing component (function/class/endpoint)

2. SERVICE IMPACT:
   - Which service triggered the failure first?
   - How did the error propagate to other services?
   - What downstream operations were affected?

3. SEVERITY ASSESSMENT:
   - CRITICAL: Data loss, complete service outage, security breach
   - HIGH: Major feature broken, significant performance impact
   - MEDIUM: Feature degraded, workaround available
   - LOW: Minor issue, cosmetic, non-blocking

4. ACTIONABLE RECOMMENDATIONS:
   - Provide specific code/configuration changes
   - Include exact values, timeouts, or thresholds to change
   - Specify which file/service to modify

Respond ONLY with valid JSON (no markdown code blocks, no backticks):
{{
  "rootCause": "Specific technical description with quoted error message",
  "originService": "exact service name from logs",
  "errorType": "database_timeout | network_error | null_pointer | memory_leak | auth_failure | rate_limit | connection_pool_exhaustion | validation_error | other",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "failingComponent": {{
    "service": "service-name",
    "file": "filename.js or unknown",
    "function": "functionName or endpoint path",
    "line": "line number if available or null"
  }},
  "propagationPath": ["Step 1: Specific description with service names", "Step 2: How it cascaded"],
  "affectedServices": ["service1", "service2"],
  "affectedEndpoints": ["/api/specific/endpoint"],
  "technicalDetails": "Detailed explanation referencing actual log content",
  "immediateActions": [
    "Specific action 1 with exact values/changes",
    "Specific action 2"
  ],
  "longTermFixes": [
    "Architectural change or code improvement with specifics",
    "Monitoring/alerting recommendation"
  ],
  "relatedErrorPatterns": ["Similar errors to watch for"],
  "estimatedImpact": {{
    "usersAffected": "none | few | some | many | all",
    "dataAtRisk": "none | low | medium | high",
    "serviceAvailability": "percentage estimate"
  }}
}}
`);

    console.log('[AnalyzerAgent] Initialized with Gemini model');
  }

  /**
   * Analyze error using AI
   * @param {object} correlatedData - Data from CorrelatorAgent
   * @returns {Promise<object>} Analysis result
   */
  async analyzeError(correlatedData) {
    console.log('[AnalyzerAgent] Starting error analysis');

    // If no model, return a basic analysis
    if (!this.model) {
      console.log('[AnalyzerAgent] No AI model - returning basic analysis');
      return this.basicAnalysis(correlatedData);
    }

    try {
      // Format logs for the prompt
      const logsText = this.formatLogsForPrompt(correlatedData.logChain);

      // Create the prompt
      const prompt = await this.promptTemplate.format({
        logs: logsText,
        originService: correlatedData.originService,
        affectedServices: correlatedData.affectedServices.join(', '),
        errorTypes: correlatedData.errorDetails.errorTypes.join(', ') || 'Unknown',
        errorMessages: correlatedData.errorDetails.errorMessages.slice(0, 5).join('\n')
      });

      console.log('[AnalyzerAgent] Sending request to Gemini (timeout: 60s)');

      // Invoke the model with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timeout')), this.timeout)
      );
      const response = await Promise.race([
        this.model.invoke(prompt),
        timeoutPromise
      ]);

      // Parse the response
      const analysis = this.parseResponse(response.content);

      // Fix originService if parsing failed or returned Unknown
      if (!analysis.originService || analysis.originService === 'Unknown' || analysis.originService.toLowerCase() === 'unknown') {
        analysis.originService = correlatedData.originService || 'USER-SERVICE';
      }

      console.log('[AnalyzerAgent] Analysis complete:', {
        rootCause: analysis.rootCause?.substring(0, 50),
        severity: analysis.severity,
        originService: analysis.originService
      });

      return {
        ...analysis,
        correlationId: correlatedData.errorId,
        timestamp: new Date().toISOString(),
        confidence: analysis.parseError ? 'low' : 'high'
      };
    } catch (error) {
      console.error('[AnalyzerAgent] Analysis failed:', error.message);

      // Fall back to basic analysis
      return {
        ...this.basicAnalysis(correlatedData),
        error: error.message,
        confidence: 'low'
      };
    }
  }

  /**
   * Format log chain for prompt
   * @param {object[]} logChain - Log chain from correlator
   * @returns {string} Formatted logs
   */
  formatLogsForPrompt(logChain) {
    return logChain
      .map(log => `[${log.timestamp}] [${log.service}] ${log.level}: ${log.message}`)
      .join('\n');
  }

  /**
   * Parse AI response to JSON
   * @param {string} content - AI response content
   * @returns {object} Parsed analysis
   */
  parseResponse(content) {
    try {
      // Remove any markdown code blocks if present
      let jsonStr = content;

      // Remove ```json and ``` markers
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Find JSON object in response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Normalize origin service - never return "Unknown"
        if (!parsed.originService || parsed.originService.toLowerCase() === 'unknown') {
          // Try to infer from affected services
          const knownServices = ['API-GATEWAY', 'USER-SERVICE', 'DB-SERVICE', 'AUTH-SERVICE', 'ORDER-SERVICE'];
          const found = parsed.affectedServices?.find(s =>
            knownServices.some(k => s.toUpperCase().includes(k.replace('-', '')))
          );
          parsed.originService = found || 'USER-SERVICE';
        }

        // Ensure all required fields have defaults
        parsed.failingComponent = parsed.failingComponent || {
          service: parsed.originService,
          file: 'unknown',
          function: 'unknown',
          line: null
        };

        parsed.estimatedImpact = parsed.estimatedImpact || {
          usersAffected: 'unknown',
          dataAtRisk: 'none',
          serviceAvailability: '100%'
        };

        parsed.relatedErrorPatterns = parsed.relatedErrorPatterns || [];
        parsed.immediateActions = parsed.immediateActions || [];
        parsed.longTermFixes = parsed.longTermFixes || [];

        return parsed;
      }

      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('[AnalyzerAgent] Failed to parse response:', error.message);
      console.error('[AnalyzerAgent] Raw content:', content.substring(0, 500));

      // Try to extract partial data from truncated JSON
      let partialRootCause = 'Unable to parse AI response';
      let partialService = null;

      // Try to extract rootCause from truncated response
      const rootCauseMatch = content.match(/"rootCause"\s*:\s*"([^"]+)/);
      if (rootCauseMatch) {
        partialRootCause = rootCauseMatch[1];
      }

      // Try to extract originService from truncated response
      const serviceMatch = content.match(/"originService"\s*:\s*"([^"]+)/);
      if (serviceMatch) {
        partialService = serviceMatch[1];
      }

      // Try to extract errorType
      let partialErrorType = 'other';
      const errorTypeMatch = content.match(/"errorType"\s*:\s*"([^"]+)/);
      if (errorTypeMatch) {
        partialErrorType = errorTypeMatch[1];
      }

      // Try to extract severity
      let partialSeverity = 'MEDIUM';
      const severityMatch = content.match(/"severity"\s*:\s*"([^"]+)/);
      if (severityMatch) {
        partialSeverity = severityMatch[1];
      }

      // Try to extract technicalDetails
      let partialTechnicalDetails = `Error analysis detected a ${partialErrorType} issue in ${partialService || 'the service'}. ${partialRootCause}`;
      const technicalMatch = content.match(/"technicalDetails"\s*:\s*"([^"]+)/);
      if (technicalMatch) {
        partialTechnicalDetails = technicalMatch[1];
      }

      // Return a structured error response (originService will be fixed by caller)
      return {
        rootCause: partialRootCause,
        originService: partialService, // null means caller should use correlation data
        errorType: partialErrorType,
        severity: partialSeverity,
        propagationPath: [],
        affectedServices: partialService ? [partialService] : [],
        affectedEndpoints: [],
        technicalDetails: partialTechnicalDetails,
        failingComponent: { service: partialService || 'unknown', file: 'unknown', function: 'unknown', line: null },
        estimatedImpact: { usersAffected: 'unknown', dataAtRisk: 'none', serviceAvailability: 'unknown' },
        parseError: error.message
      };
    }
  }

  /**
   * Basic analysis without AI
   * @param {object} correlatedData - Correlated log data
   * @returns {object} Basic analysis
   */
  basicAnalysis(correlatedData) {
    let { originService, errorDetails, affectedServices, errorMessage } = correlatedData;

    // Ensure we have a valid service name, not "UNKNOWN"
    if (!originService || originService === 'UNKNOWN') {
      // Try to find a known service from affected services
      const knownServices = ['API-GATEWAY', 'USER-SERVICE', 'DB-SERVICE'];
      originService = affectedServices.find(s => knownServices.includes(s.toUpperCase())) || 'USER-SERVICE';
    }

    // Determine error type based on patterns
    let errorType = 'other';
    const errorTypes = errorDetails.errorTypes || [];

    if (errorTypes.includes('TIMEOUT')) errorType = 'database_timeout';
    else if (errorTypes.includes('CONNECTION_REFUSED')) errorType = 'network_error';
    else if (errorTypes.includes('POOL_EXHAUSTED')) errorType = 'connection_pool_exhaustion';
    else if (errorTypes.includes('MEMORY_ERROR')) errorType = 'memory_leak';
    else if (errorTypes.includes('NULL_POINTER')) errorType = 'null_pointer';
    else if (errorTypes.includes('DEADLOCK')) errorType = 'database_timeout';
    else if (errorTypes.includes('DUPLICATE_ERROR')) errorType = 'validation_error';
    else if (errorTypes.includes('OPERATION_FAILED')) errorType = 'network_error';
    else if (errorTypes.includes('HTTP_ERROR')) errorType = 'network_error';

    // Generate detailed root cause from error messages
    let rootCause = 'Error detected in service';
    const messages = errorDetails.errorMessages || [];

    if (messages.length > 0) {
      // Parse the most informative error message
      const primaryMessage = messages[0];

      if (/timeout/i.test(primaryMessage)) {
        rootCause = `Database connection timeout - the database is not responding within the expected time limit`;
      } else if (/deadlock/i.test(primaryMessage)) {
        rootCause = `Database deadlock detected - multiple transactions are waiting for each other's locks`;
      } else if (/memory.*high|memory.*leak/i.test(primaryMessage)) {
        rootCause = `Memory usage critically high - potential memory leak causing heap exhaustion`;
      } else if (/duplicate|already exists/i.test(primaryMessage)) {
        rootCause = `Duplicate entry constraint violation - attempting to insert data that already exists`;
      } else if (/connection.*refused/i.test(primaryMessage)) {
        rootCause = `Connection refused - the target service is not accepting connections`;
      } else if (/pool.*exhausted/i.test(primaryMessage)) {
        rootCause = `Connection pool exhausted - all available database connections are in use`;
      } else if (/failed to fetch/i.test(primaryMessage)) {
        rootCause = `Service communication failure - unable to retrieve data from downstream service`;
      } else if (/failed to create/i.test(primaryMessage)) {
        rootCause = `Data creation failed - unable to create new record in the database`;
      } else if (/504|gateway.*timeout/i.test(primaryMessage)) {
        rootCause = `Gateway timeout - upstream service took too long to respond`;
      } else if (/500/i.test(primaryMessage)) {
        rootCause = `Internal server error - unexpected error occurred during request processing`;
      } else {
        // Use the first error message as root cause
        rootCause = primaryMessage.split('|')[0].trim();
      }
    }

    // Determine severity
    let severity = 'MEDIUM';
    if (affectedServices.length >= 3) severity = 'CRITICAL';
    else if (affectedServices.length === 2) severity = 'HIGH';
    else if (errorDetails.errorCount > 5) severity = 'HIGH';
    else if (errorType === 'memory_leak') severity = 'HIGH';
    else if (errorType === 'database_timeout' && errorDetails.errorCount > 2) severity = 'HIGH';

    // Generate specific technical details
    const technicalDetails = this.generateTechnicalDetails(errorType, originService, errorDetails, messages);

    // Generate specific immediate actions
    const immediateActions = this.generateImmediateActions(errorType, originService);

    // Generate specific long-term fixes
    const longTermFixes = this.generateLongTermFixes(errorType);

    // Extract failing component from error messages
    const failingComponent = this.extractFailingComponent(messages, originService);

    // Estimate impact
    const estimatedImpact = {
      usersAffected: affectedServices.length >= 3 ? 'many' : affectedServices.length >= 2 ? 'some' : 'few',
      dataAtRisk: errorType === 'database_timeout' || errorType === 'validation_error' ? 'medium' : 'none',
      serviceAvailability: severity === 'CRITICAL' ? '50%' : severity === 'HIGH' ? '80%' : '95%'
    };

    return {
      rootCause: rootCause,
      originService: originService,
      errorType: errorType,
      severity: severity,
      failingComponent: failingComponent,
      propagationPath: affectedServices.map((s, i) =>
        `Step ${i + 1}: Error ${i === 0 ? 'originated in' : 'propagated to'} ${s}`
      ),
      affectedServices: affectedServices,
      affectedEndpoints: errorDetails.affectedEndpoints,
      technicalDetails: technicalDetails,
      immediateActions: immediateActions,
      longTermFixes: longTermFixes,
      relatedErrorPatterns: this.findRelatedPatterns(errorType),
      estimatedImpact: estimatedImpact,
      confidence: 'medium'
    };
  }

  /**
   * Extract failing component from error messages
   */
  extractFailingComponent(messages, originService) {
    const component = {
      service: originService,
      file: 'unknown',
      function: 'unknown',
      line: null
    };

    for (const msg of messages) {
      // Try to extract file name
      const fileMatch = msg.match(/(\w+\.js|\w+\.ts)(?::(\d+))?/);
      if (fileMatch) {
        component.file = fileMatch[1];
        if (fileMatch[2]) {
          component.line = parseInt(fileMatch[2]);
        }
      }

      // Try to extract function name
      const funcMatch = msg.match(/(?:at|in|function)\s+(\w+)/i);
      if (funcMatch) {
        component.function = funcMatch[1];
      }

      // Try to extract endpoint
      const endpointMatch = msg.match(/(?:GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\-\/]+)/);
      if (endpointMatch) {
        component.function = endpointMatch[1];
      }
    }

    return component;
  }

  /**
   * Find related error patterns to watch for
   */
  findRelatedPatterns(errorType) {
    const patterns = {
      database_timeout: ['Connection pool exhaustion', 'Query timeouts', 'Deadlock warnings'],
      memory_leak: ['High GC activity', 'Heap warnings', 'Out of memory'],
      connection_pool_exhaustion: ['Database timeouts', 'Connection refused', 'Pool wait timeouts'],
      network_error: ['Connection reset', 'DNS resolution failures', 'TLS handshake errors'],
      null_pointer: ['Undefined variable', 'Property access on null', 'Type errors'],
      validation_error: ['Constraint violations', 'Duplicate key', 'Invalid format'],
      auth_failure: ['Token expired', 'Invalid credentials', 'Permission denied'],
      rate_limit: ['429 errors', 'Quota exceeded', 'Throttling warnings']
    };

    return patterns[errorType] || ['General errors in related services'];
  }

  /**
   * Generate technical details based on error type
   */
  generateTechnicalDetails(errorType, originService, errorDetails, messages) {
    const details = {
      database_timeout: `Database operations in ${originService} are exceeding timeout thresholds. This typically indicates slow queries, database overload, or network latency issues. ${errorDetails.errorCount} timeout(s) detected.`,
      memory_leak: `Memory usage in ${originService} has reached critical levels. The heap is being exhausted, likely due to unbounded data structures or missing cleanup routines.`,
      connection_pool_exhaustion: `The connection pool in ${originService} has no available connections. All ${errorDetails.errorCount} connections are in use, causing new requests to wait or fail.`,
      network_error: `Network communication failures detected between services. ${originService} is unable to reach downstream dependencies.`,
      null_pointer: `Null or undefined value access in ${originService}. A variable was used before being properly initialized or validated.`,
      validation_error: `Data validation failure in ${originService}. Duplicate or invalid data was submitted that violates database constraints.`,
      other: `Error detected in ${originService}. ${errorDetails.errorCount} error(s) across ${errorDetails.affectedEndpoints.length} endpoint(s).`
    };

    return details[errorType] || details.other;
  }

  /**
   * Generate immediate actions based on error type
   */
  generateImmediateActions(errorType, originService) {
    const actions = {
      database_timeout: [
        `Check ${originService} database connection status`,
        'Review slow query logs for long-running queries',
        'Verify database server CPU and memory usage',
        'Check network latency between service and database'
      ],
      memory_leak: [
        `Restart ${originService} container to free memory`,
        'Check heap dump for large object allocations',
        'Review recent code changes for unbounded arrays/caches',
        'Monitor memory growth rate after restart'
      ],
      connection_pool_exhaustion: [
        'Check for connection leaks (unreleased connections)',
        'Review active queries for long-running transactions',
        'Temporarily increase pool size as a quick fix',
        'Identify and kill idle connections'
      ],
      network_error: [
        'Verify all dependent services are running',
        'Check Docker network configuration',
        'Test service-to-service connectivity',
        'Review firewall and security group rules'
      ],
      validation_error: [
        'Check input data for duplicates',
        'Review database unique constraints',
        'Add input validation before database operations',
        'Implement idempotency checks'
      ]
    };

    return actions[errorType] || [
      `Check ${originService} logs for details`,
      'Verify service health endpoints',
      'Review recent deployments or changes',
      'Check dependent service status'
    ];
  }

  /**
   * Generate long-term fixes based on error type
   */
  generateLongTermFixes(errorType) {
    const fixes = {
      database_timeout: [
        'Implement query timeouts with retry logic',
        'Add database connection pooling if not present',
        'Optimize slow queries with proper indexing',
        'Implement caching for frequently accessed data'
      ],
      memory_leak: [
        'Implement bounded data structures with size limits',
        'Add periodic cleanup routines for caches',
        'Use WeakMap/WeakSet for object references',
        'Implement memory monitoring and alerts'
      ],
      connection_pool_exhaustion: [
        'Implement proper connection release in finally blocks',
        'Add connection timeout and eviction policies',
        'Scale database resources or add read replicas',
        'Implement connection health checks'
      ],
      network_error: [
        'Implement circuit breaker pattern',
        'Add retry logic with exponential backoff',
        'Implement service mesh for better resilience',
        'Add health checks and automatic recovery'
      ],
      validation_error: [
        'Implement upsert operations instead of insert',
        'Add duplicate detection before database writes',
        'Implement optimistic locking for concurrent updates',
        'Add comprehensive input validation'
      ]
    };

    return fixes[errorType] || [
      'Implement comprehensive error handling',
      'Add structured logging for debugging',
      'Implement monitoring and alerting',
      'Add automated health checks'
    ];
  }
}

module.exports = AnalyzerAgent;
