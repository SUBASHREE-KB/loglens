/**
 * Fix Generator Agent
 * Uses AI to generate code fixes for detected errors
 */

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PromptTemplate } = require('@langchain/core/prompts');
const sourceCodeManager = require('../services/SourceCodeManager'); // replaces legacy codeReader

class FixGeneratorAgent {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[FixGeneratorAgent] No API key provided - fix generation will be template-based');
      this.model = null;
      return;
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: 'gemini-2.5-flash',  // Use Flash for speed
      temperature: 0.3,
      maxOutputTokens: 2048
    });

    this.timeout = 90000; // 90 second timeout for fix generation (needs more time)

    this.promptTemplate = PromptTemplate.fromTemplate(`
You are a senior software engineer fixing production bugs in a Node.js/Express microservice.

Error Analysis:
- Root Cause: {rootCause}
- Error Type: {errorType}
- Severity: {severity}

Problematic Code Location:
- File: {filePath}
- Function: {functionName}
- Issue: {explanation}

Code Snippet with Bug:
{codeSnippet}

Complete Current File Content:
{fullFileContent}

Generate a fix that:
1. Resolves the root cause completely
2. Adds proper error handling with try-catch blocks
3. Includes retry logic with exponential backoff if applicable
4. Adds better logging for debugging
5. Follows Node.js best practices
6. Maintains the existing code style and structure

IMPORTANT: The fixedCode must be the COMPLETE rewritten file content, not just the changed portion.

Respond with valid JSON (no markdown code blocks, no backticks):
{{
  "fixedCode": "COMPLETE rewritten file content as a single string with proper escaping",
  "changes": [
    "Change 1 description",
    "Change 2 description",
    "Change 3 description"
  ],
  "explanation": "detailed explanation of why these changes fix the issue",
  "preventionTips": "how to prevent similar issues in the future",
  "testSuggestions": [
    "Test case 1",
    "Test case 2"
  ]
}}
`);

    console.log('[FixGeneratorAgent] Initialized');
  }

  /**
   * Generate a fix for the identified code issue
   * @param {object} codeLocation - Location from CodeLocatorAgent
   * @param {object} analysis - Analysis from AnalyzerAgent
   * @returns {Promise<object>} Generated fix
   */
  async generateFix(codeLocation, analysis) {
    console.log('[FixGeneratorAgent] Generating fix for:', codeLocation?.fileName);

    // Get service name from codeLocation or analysis
    const serviceName = codeLocation?.serviceName || analysis?.originService || 'user-service';
    const dirName = sourceCodeManager.mapServiceName(serviceName);
    const fileName = codeLocation?.fileName || 'index.js';

    try {
      // Read the full file content
      const fileResult = await sourceCodeManager.readFile(dirName, fileName);
      const fullFileContent = fileResult ? fileResult.content : null;
      if (!fullFileContent) throw new Error(`Could not read ${fileName} from ${dirName}`);

      // If no AI model, use template-based fix
      if (!this.model) {
        return this.templateBasedFix(codeLocation, analysis, fullFileContent);
      }

      // Create prompt
      const prompt = await this.promptTemplate.format({
        rootCause: analysis.rootCause,
        errorType: analysis.errorType,
        severity: analysis.severity,
        filePath: codeLocation.filePath,
        functionName: codeLocation.functionName,
        explanation: codeLocation.explanation,
        codeSnippet: codeLocation.codeSnippet,
        fullFileContent: fullFileContent
      });

      console.log('[FixGeneratorAgent] Sending request to Gemini (timeout: 90s)');

      // Add timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fix generation timeout')), this.timeout)
      );
      const response = await Promise.race([
        this.model.invoke(prompt),
        timeoutPromise
      ]);
      const fix = this.parseResponse(response.content);

      console.log('[FixGeneratorAgent] Fix generated with', fix.changes?.length || 0, 'changes');

      return {
        ...fix,
        originalCode: fullFileContent,
        fileName: fileName,
        filePath: codeLocation?.filePath || `${dirName}/${fileName}`,
        serviceName: serviceName,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[FixGeneratorAgent] Failed to generate fix:', error.message);

      // Try to read the actual code for template-based fix
      let originalCode = '// Could not read original file';
      try {
        const origResult = await sourceCodeManager.readFile(dirName, fileName);
          originalCode = origResult ? origResult.content : null;
      } catch (readError) {
        console.error('[FixGeneratorAgent] Could not read source code:', readError.message);
      }

      // Generate a smart template fix based on error type and actual code
      const smartFix = this.generateSmartTemplateFix(originalCode, analysis, codeLocation, serviceName);

      return {
        ...smartFix,
        originalCode: originalCode,
        fileName: fileName,
        filePath: codeLocation?.filePath || `${dirName}/${fileName}`,
        serviceName: serviceName,
        templateBased: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate a smart template fix based on actual code and error type
   */
  generateSmartTemplateFix(originalCode, analysis, codeLocation, serviceName) {
    const errorType = analysis?.errorType || 'other';
    const rootCause = analysis?.rootCause || 'Unknown error';

    // If we couldn't read the code, return basic template
    if (originalCode === '// Could not read original file') {
      return {
        fixedCode: this.getTemplateFix(errorType),
        changes: ['Added error handling template', 'Added retry logic'],
        explanation: `Template fix for ${errorType}. Could not read original file.`,
        preventionTips: 'Implement proper error handling and monitoring'
      };
    }

    let fixedCode = originalCode;
    let changes = [];
    let explanation = '';
    let preventionTips = '';

    switch (errorType) {
      case 'memory_leak':
        // Find and fix memory leak patterns
        const memoryFixes = this.fixMemoryLeak(originalCode);
        fixedCode = memoryFixes.code;
        changes = memoryFixes.changes;
        explanation = 'Fixed memory leak by implementing bounded array with automatic cleanup and adding memory monitoring.';
        preventionTips = 'Use bounded data structures, implement cleanup intervals, and monitor heap usage.';
        break;

      case 'database_timeout':
        const timeoutFixes = this.fixDatabaseTimeout(originalCode);
        fixedCode = timeoutFixes.code;
        changes = timeoutFixes.changes;
        explanation = 'Added retry logic with exponential backoff and increased timeout values.';
        preventionTips = 'Implement query timeouts, add retry logic, and use connection pooling.';
        break;

      case 'connection_pool_exhaustion':
        const poolFixes = this.fixConnectionPool(originalCode);
        fixedCode = poolFixes.code;
        changes = poolFixes.changes;
        explanation = 'Increased pool size, added connection recycling, and implemented queue management.';
        preventionTips = 'Monitor pool usage, implement connection timeouts, and use proper pool sizing.';
        break;

      case 'network_error':
        const networkFixes = this.fixNetworkError(originalCode);
        fixedCode = networkFixes.code;
        changes = networkFixes.changes;
        explanation = 'Added circuit breaker pattern and retry logic for network resilience.';
        preventionTips = 'Implement circuit breakers, add timeouts, and handle network errors gracefully.';
        break;

      default:
        fixedCode = this.addGenericErrorHandling(originalCode);
        changes = ['Added comprehensive error handling', 'Added error logging'];
        explanation = `Added error handling for ${rootCause}`;
        preventionTips = 'Implement proper error handling and monitoring';
    }

    return { fixedCode, changes, explanation, preventionTips };
  }

  /**
   * Fix memory leak in code
   */
  fixMemoryLeak(code) {
    let fixedCode = code;
    const changes = [];

    // Find array declarations that might cause leaks
    const arrayMatch = code.match(/let\s+(\w+)\s*=\s*\[\];/);
    if (arrayMatch) {
      const arrayName = arrayMatch[1];

      // Add bounded array utility at the top
      const boundedUtility = `
// Memory-safe bounded array with automatic cleanup
const MAX_ARRAY_SIZE = 1000;
function boundedPush(array, item) {
  if (array.length >= MAX_ARRAY_SIZE) {
    array.splice(0, Math.floor(MAX_ARRAY_SIZE / 2)); // Remove oldest half
    console.log('[Memory] Cleaned up array, removed oldest entries');
  }
  array.push(item);
}

// Periodic cleanup interval
setInterval(() => {
  if (${arrayName}.length > MAX_ARRAY_SIZE / 2) {
    ${arrayName}.splice(0, Math.floor(${arrayName}.length / 2));
    console.log('[Memory] Periodic cleanup executed');
  }
}, 60000);

`;
      // Insert after requires
      const requiresEnd = code.lastIndexOf("require('");
      const insertPos = code.indexOf('\n', requiresEnd + 1) + 1;
      fixedCode = code.slice(0, insertPos) + boundedUtility + code.slice(insertPos);

      // Replace .push() with boundedPush()
      fixedCode = fixedCode.replace(
        new RegExp(`${arrayName}\\.push\\(`, 'g'),
        `boundedPush(${arrayName}, `
      );

      changes.push(`Added bounded array utility with MAX_ARRAY_SIZE = 1000`);
      changes.push(`Replaced ${arrayName}.push() with boundedPush()`);
      changes.push('Added periodic cleanup interval (every 60 seconds)');
    }

    // Add memory monitoring
    if (!code.includes('memoryUsage')) {
      changes.push('Consider adding memory usage monitoring');
    }

    return { code: fixedCode, changes };
  }

  /**
   * Fix database timeout issues
   */
  fixDatabaseTimeout(code) {
    let fixedCode = code;
    const changes = [];

    // Add retry utility
    const retryUtility = `
// Retry utility with exponential backoff
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.log(\`[Retry] Attempt \${attempt} failed: \${error.message}\`);
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

`;
    // Insert after requires
    if (!code.includes('withRetry')) {
      const requiresEnd = code.lastIndexOf("require('");
      const insertPos = code.indexOf('\n', requiresEnd + 1) + 1;
      fixedCode = code.slice(0, insertPos) + retryUtility + code.slice(insertPos);
      changes.push('Added retry utility with exponential backoff');
    }

    // Increase timeouts
    fixedCode = fixedCode.replace(/timeout:\s*\d+/g, 'timeout: 60000');
    if (code.match(/timeout:\s*\d+/)) {
      changes.push('Increased timeout to 60000ms');
    }

    return { code: fixedCode, changes };
  }

  /**
   * Fix connection pool exhaustion
   */
  fixConnectionPool(code) {
    let fixedCode = code;
    const changes = [];

    // Find and update pool configuration
    fixedCode = fixedCode.replace(/max:\s*(\d+)/, (match, num) => {
      const newMax = Math.max(parseInt(num) * 2, 50);
      changes.push(`Increased pool max from ${num} to ${newMax}`);
      return `max: ${newMax}`;
    });

    // Add pool monitoring
    const poolMonitoring = `
// Pool health monitoring
function checkPoolHealth(pool) {
  const utilization = (pool.active / pool.max) * 100;
  if (utilization > 80) {
    console.warn('[Pool] High utilization:', utilization.toFixed(1) + '%');
  }
  return utilization;
}

`;
    if (!code.includes('checkPoolHealth')) {
      const requiresEnd = code.lastIndexOf("require('");
      const insertPos = code.indexOf('\n', requiresEnd + 1) + 1;
      fixedCode = code.slice(0, insertPos) + poolMonitoring + code.slice(insertPos);
      changes.push('Added pool health monitoring');
    }

    return { code: fixedCode, changes };
  }

  /**
   * Fix network errors
   */
  fixNetworkError(code) {
    let fixedCode = code;
    const changes = [];

    // Add circuit breaker
    const circuitBreaker = `
// Circuit breaker for network calls
class CircuitBreaker {
  constructor(threshold = 5, resetTimeout = 30000) {
    this.failures = 0;
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED';
    this.lastFailure = null;
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'HALF-OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() { this.failures = 0; this.state = 'CLOSED'; }
  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) this.state = 'OPEN';
  }
}

const circuitBreaker = new CircuitBreaker();

`;
    if (!code.includes('CircuitBreaker')) {
      const requiresEnd = code.lastIndexOf("require('");
      const insertPos = code.indexOf('\n', requiresEnd + 1) + 1;
      fixedCode = code.slice(0, insertPos) + circuitBreaker + code.slice(insertPos);
      changes.push('Added circuit breaker pattern');
    }

    return { code: fixedCode, changes };
  }

  /**
   * Add generic error handling
   */
  addGenericErrorHandling(code) {
    const errorHandler = `
// Centralized error handler
function handleError(error, context = '') {
  console.error(\`[ERROR] \${context}:\`, error.message);
  // Add error reporting here
}

`;
    const requiresEnd = code.lastIndexOf("require('");
    const insertPos = code.indexOf('\n', requiresEnd + 1) + 1;
    return code.slice(0, insertPos) + errorHandler + code.slice(insertPos);
  }

  /**
   * Parse AI response
   * @param {string} content - AI response
   * @returns {object} Parsed fix
   */
  parseResponse(content) {
    try {
      let jsonStr = content;
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      }

      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('[FixGeneratorAgent] Parse error:', error.message);
      return {
        fixedCode: '// AI-generated fix could not be parsed\n// Please review manually',
        changes: ['Parse error - manual review required'],
        explanation: 'Failed to parse AI response: ' + error.message,
        preventionTips: 'Review error handling patterns',
        parseError: true
      };
    }
  }

  /**
   * Generate template-based fix without AI
   * @param {object} codeLocation - Code location
   * @param {object} analysis - Error analysis
   * @param {string} originalCode - Original file content
   * @returns {object} Template fix
   */
  templateBasedFix(codeLocation, analysis, originalCode) {
    const fixes = {
      database_timeout: this.generateTimeoutFix,
      connection_pool_exhaustion: this.generatePoolFix,
      null_pointer: this.generateNullCheckFix,
      memory_leak: this.generateMemoryFix,
      network_error: this.generateNetworkFix
    };

    const generator = fixes[analysis.errorType] || this.generateGenericFix;
    const { fixedCode, changes } = generator.call(this, codeLocation, originalCode);

    return {
      fixedCode: fixedCode,
      originalCode: originalCode,
      changes: changes,
      explanation: `Template-based fix for ${analysis.errorType}`,
      preventionTips: 'Implement comprehensive error handling and monitoring',
      testSuggestions: [
        'Test with simulated timeout conditions',
        'Test error handling paths',
        'Load test to verify fix under stress'
      ],
      fileName: codeLocation.fileName,
      serviceName: codeLocation.serviceName,
      templateBased: true
    };
  }

  /**
   * Generate fix for timeout issues
   */
  generateTimeoutFix(codeLocation, originalCode) {
    const retryWrapper = `
// Retry utility with exponential backoff
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(\`Retry attempt \${attempt} after \${delay}ms\`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

`;
    return {
      fixedCode: retryWrapper + originalCode.replace(
        /timeout:\s*\d+/g,
        'timeout: 30000'
      ),
      changes: [
        'Added retry utility with exponential backoff',
        'Increased timeout from default to 30 seconds',
        'Added retry logging'
      ]
    };
  }

  /**
   * Generate fix for connection pool issues
   */
  generatePoolFix(codeLocation, originalCode) {
    return {
      fixedCode: originalCode.replace(
        /max:\s*\d+/g,
        'max: 50'
      ).replace(
        /idle:\s*\d+/g,
        'idle: 30'
      ),
      changes: [
        'Increased connection pool max size to 50',
        'Increased idle connections to 30',
        'Consider implementing connection health checks'
      ]
    };
  }

  /**
   * Generate fix for null pointer issues
   */
  generateNullCheckFix(codeLocation, originalCode) {
    // Add optional chaining where applicable
    let fixed = originalCode.replace(
      /(\w+)\.(\w+)\.(\w+)/g,
      '$1?.$2?.$3'
    );

    return {
      fixedCode: fixed,
      changes: [
        'Added optional chaining (?.) for safe property access',
        'Consider adding input validation',
        'Add null checks before accessing nested properties'
      ]
    };
  }

  /**
   * Generate fix for memory leak issues
   */
  generateMemoryFix(codeLocation, originalCode) {
    const cleanupCode = `
// Memory management utilities
const MAX_CACHE_SIZE = 1000;
function limitedPush(array, item) {
  if (array.length >= MAX_CACHE_SIZE) {
    array.shift(); // Remove oldest item
  }
  array.push(item);
}

`;
    return {
      fixedCode: cleanupCode + originalCode,
      changes: [
        'Added memory management utilities',
        'Implemented bounded cache with MAX_CACHE_SIZE',
        'Added cleanup for oldest items when limit reached'
      ]
    };
  }

  /**
   * Generate fix for network errors
   */
  generateNetworkFix(codeLocation, originalCode) {
    const circuitBreaker = `
// Simple circuit breaker implementation
class CircuitBreaker {
  constructor(threshold = 5, resetTimeout = 30000) {
    this.failures = 0;
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF-OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }
}

`;
    return {
      fixedCode: circuitBreaker + originalCode,
      changes: [
        'Added circuit breaker pattern',
        'Prevents cascade failures when service is unavailable',
        'Auto-recovery after reset timeout'
      ]
    };
  }

  /**
   * Get a simple template fix based on error type
   */
  getTemplateFix(errorType) {
    const templates = {
      database_timeout: `
// Fix: Added timeout handling and retry logic
async function withTimeout(promise, ms = 30000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Operation timed out')), ms)
  );
  return Promise.race([promise, timeout]);
}

async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
`,
      connection_pool_exhaustion: `
// Fix: Connection pool management
const poolConfig = {
  max: 50,
  min: 5,
  idle: 30000,
  acquire: 60000,
  evict: 10000
};
`,
      network_error: `
// Fix: Circuit breaker for network calls
let failures = 0;
const THRESHOLD = 5;
const RESET_TIME = 30000;
let circuitOpen = false;
let lastFailure = 0;

async function protectedCall(fn) {
  if (circuitOpen && Date.now() - lastFailure < RESET_TIME) {
    throw new Error('Circuit breaker open');
  }
  try {
    const result = await fn();
    failures = 0;
    circuitOpen = false;
    return result;
  } catch (err) {
    failures++;
    lastFailure = Date.now();
    if (failures >= THRESHOLD) circuitOpen = true;
    throw err;
  }
}
`
    };
    return templates[errorType] || `
// Fix: General error handling
function handleError(error, context) {
  console.error(\`[\${context}] Error:\`, error.message);
  // Add your error reporting here
}
`;
  }

  /**
   * Generate generic fix
   */
  generateGenericFix(codeLocation, originalCode) {
    const errorHandling = `
// Enhanced error handling
function handleError(error, context = '') {
  console.error(\`[ERROR] \${context}:\`, error.message);
  console.error('[ERROR] Stack:', error.stack);
  // Add your error reporting service here
}

`;
    return {
      fixedCode: errorHandling + originalCode,
      changes: [
        'Added centralized error handling utility',
        'Enhanced error logging with context',
        'Placeholder for error reporting integration'
      ]
    };
  }
}

module.exports = FixGeneratorAgent;