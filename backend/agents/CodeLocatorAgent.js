/**
 * Code Locator Agent
 * Uses AI to find the exact code location causing errors
 */

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PromptTemplate } = require('@langchain/core/prompts');
const sourceCodeManager = require('../services/SourceCodeManager');

class CodeLocatorAgent {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[CodeLocatorAgent] No API key provided - code location will be basic');
      this.model = null;
      return;
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: 'gemini-2.5-flash',  // Use Flash for speed
      temperature: 0.2,
      maxOutputTokens: 2048  // Increased to prevent JSON truncation
    });

    this.timeout = 60000; // 60 second timeout

    this.promptTemplate = PromptTemplate.fromTemplate(`
You are a code analysis expert specializing in Node.js and Express applications.

Error Analysis:
- Root Cause: {rootCause}
- Error Type: {errorType}
- Origin Service: {serviceName}
- Technical Details: {technicalDetails}
- Error Messages: {errorMessages}

Source Code of {serviceName}:
{sourceCode}

Find the exact location in this code that causes the error. Look for:
1. The function or code block that directly causes the error
2. Missing error handling
3. Timeout configurations
4. Database connection issues
5. Null/undefined access

Respond ONLY with valid JSON (no markdown code blocks, no backticks):
{{
  "filePath": "relative path from service root (e.g., index.js or database.js)",
  "fileName": "the file name",
  "functionName": "name of the function containing the bug",
  "lineNumber": approximate line number (integer),
  "codeSnippet": "the problematic code section (5-10 lines, exact copy from source)",
  "explanation": "why this code causes the error",
  "suggestionPreview": "brief description of how to fix it"
}}
`);

    console.log('[CodeLocatorAgent] Initialized');
  }

  /**
   * Locate code causing the error
   * @param {object} analysis - Analysis from AnalyzerAgent
   * @param {string} serviceName - Name of the origin service
   * @returns {Promise<object>} Code location details
   */
  async locateCode(analysis, serviceName) {
    console.log('[CodeLocatorAgent] Locating code in:', serviceName);

    // Map service name to directory name using SourceCodeManager
    const dirName = sourceCodeManager.mapServiceName(serviceName);

    try {
      // Read all source code from the service using SourceCodeManager
      const fileList = await sourceCodeManager.listFiles(serviceName);
      const codeFiles = {};

      for (const fileName of fileList) {
        const result = await sourceCodeManager.readFile(serviceName, fileName);
        if (result && result.content) {
          codeFiles[fileName] = result.content;
        }
      }

      if (Object.keys(codeFiles).length === 0) {
        console.warn('[CodeLocatorAgent] No source files found for:', dirName);
        return this.fallbackLocation(serviceName, analysis);
      }

      // If no AI model, use pattern matching
      if (!this.model) {
        return this.patternBasedLocation(codeFiles, analysis, serviceName);
      }

      // Format source code for prompt
      const sourceCodeText = Object.entries(codeFiles)
        .map(([file, content]) => `\n--- File: ${file} ---\n${content}`)
        .join('\n\n');

      // Create prompt
      const prompt = await this.promptTemplate.format({
        rootCause: analysis.rootCause,
        errorType: analysis.errorType,
        serviceName: serviceName,
        technicalDetails: analysis.technicalDetails,
        errorMessages: analysis.affectedEndpoints?.join(', ') || 'N/A',
        sourceCode: sourceCodeText
      });

      console.log('[CodeLocatorAgent] Sending request to Gemini (timeout: 60s)');

      // Add timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Code location timeout')), this.timeout)
      );
      const response = await Promise.race([
        this.model.invoke(prompt),
        timeoutPromise
      ]);
      const location = this.parseResponse(response.content);

      console.log('[CodeLocatorAgent] Code located:', {
        file: location.fileName,
        function: location.functionName,
        line: location.lineNumber
      });

      return {
        ...location,
        serviceName: serviceName,
        serviceDir: dirName,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[CodeLocatorAgent] Failed to locate code:', error.message);
      return this.fallbackLocation(serviceName, analysis);
    }
  }

  /**
   * Parse AI response
   * @param {string} content - AI response
   * @returns {object} Parsed location
   */
  parseResponse(content) {
    try {
      let jsonStr = content;
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('[CodeLocatorAgent] Parse error:', error.message);
      return {
        filePath: 'index.js',
        fileName: 'index.js',
        functionName: 'unknown',
        lineNumber: 1,
        codeSnippet: 'Unable to locate specific code',
        explanation: 'Failed to parse AI response: ' + error.message,
        parseError: true
      };
    }
  }

  /**
   * Pattern-based code location (no AI)
   * @param {object} codeFiles - Map of file names to content
   * @param {object} analysis - Error analysis
   * @param {string} serviceName - Service name
   * @returns {object} Location result
   */
  patternBasedLocation(codeFiles, analysis, serviceName) {
    // Specific patterns for each error type - more precise matching
    const patterns = {
      database_timeout: [
        /timeout.*=.*\d+/i,
        /query.*timeout/i,
        /ER_QUERY_TIMEOUT/i,
        /setTimeout.*query/i,
        /\.query\(/i
      ],
      connection_pool_exhaustion: [
        /connectionPool/i,
        /pool.*exhausted/i,
        /pool.*max/i,
        /active.*=.*max/i,
        /\.pool\s*=/i
      ],
      null_pointer: [
        /cannot read.*null/i,
        /undefined.*property/i,
        /\w+\.\w+\.\w+/,
        /if\s*\(\s*!\w+/
      ],
      memory_leak: [
        /memoryLeak/i,
        /\.push\(/i,
        /heapUsed/i,
        /memory.*high/i,
        /let\s+\w+\s*=\s*\[\]/,
        /checkMemory/i
      ],
      network_error: [
        /axios\.(get|post|put|delete)/i,
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /fetch\(/i
      ]
    };

    const errorPatterns = patterns[analysis.errorType] || [/ERROR/i, /throw\s+new/i, /catch\s*\(/i];

    // First pass: look for the most specific patterns related to the error
    for (const [fileName, content] of Object.entries(codeFiles)) {
      const lines = content.split('\n');
      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let matchScore = 0;

        // Score based on how many patterns match
        for (const pattern of errorPatterns) {
          if (pattern.test(line)) {
            matchScore++;
          }
        }

        // Also check surrounding lines for context
        const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join('\n');
        for (const pattern of errorPatterns) {
          if (pattern.test(context)) {
            matchScore += 0.5;
          }
        }

        if (matchScore > bestScore) {
          bestScore = matchScore;
          bestMatch = { index: i, line, matchScore };
        }
      }

      if (bestMatch && bestScore >= 1) {
        const i = bestMatch.index;
        // Extract more surrounding code for context
        const start = Math.max(0, i - 5);
        const end = Math.min(lines.length, i + 10);
        const snippet = lines.slice(start, end).join('\n');

        // Try to find function name
        let functionName = 'anonymous';
        for (let j = i; j >= Math.max(0, i - 30); j--) {
          const funcMatch = lines[j].match(/(?:function|async function)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?function/);
          if (funcMatch) {
            functionName = funcMatch[1] || funcMatch[2] || funcMatch[3];
            break;
          }
        }

        // Generate specific explanation based on error type
        const explanations = {
          memory_leak: `Memory leak pattern detected: unbounded array growth or missing cleanup`,
          database_timeout: `Database timeout configuration or slow query detected`,
          connection_pool_exhaustion: `Connection pool reaching maximum capacity`,
          network_error: `Network request without proper error handling`,
          null_pointer: `Potential null/undefined access without validation`
        };

        return {
          filePath: fileName,
          fileName: fileName,
          functionName: functionName,
          lineNumber: i + 1,
          codeSnippet: snippet,
          explanation: explanations[analysis.errorType] || `Issue detected at line ${i + 1}`,
          suggestionPreview: this.getSuggestionPreview(analysis.errorType),
          serviceName: serviceName,
          confidence: bestScore >= 2 ? 'high' : 'medium'
        };
      }
    }

    return this.fallbackLocation(serviceName, analysis);
  }

  /**
   * Get suggestion preview based on error type
   */
  getSuggestionPreview(errorType) {
    const suggestions = {
      memory_leak: 'Implement bounded cache with size limits and cleanup',
      database_timeout: 'Add retry logic with exponential backoff',
      connection_pool_exhaustion: 'Increase pool size and implement connection recycling',
      network_error: 'Add circuit breaker pattern and retry logic',
      null_pointer: 'Add null checks and optional chaining'
    };
    return suggestions[errorType] || 'Add proper error handling';
  }

  /**
   * Fallback location when code can't be found
   * @param {string} serviceName - Service name
   * @param {object} analysis - Error analysis
   * @returns {object} Fallback location
   */
  fallbackLocation(serviceName, analysis) {
    // Ensure we have a valid service name
    let normalizedService = serviceName;
    if (!normalizedService || normalizedService === 'UNKNOWN' || normalizedService === 'Unknown') {
      normalizedService = 'USER-SERVICE';
    }

    // Map error types to common locations
    const errorTypeLocations = {
      'database_timeout': { func: 'database query handler', line: 50 },
      'connection_pool_exhaustion': { func: 'connection pool', line: 30 },
      'network_error': { func: 'HTTP request handler', line: 60 },
      'null_pointer': { func: 'data processing', line: 40 },
      'memory_leak': { func: 'cache handler', line: 25 }
    };

    const location = errorTypeLocations[analysis?.errorType] || { func: 'request handler', line: 50 };

    return {
      filePath: 'index.js',
      fileName: 'index.js',
      functionName: location.func,
      lineNumber: location.line,
      codeSnippet: `// Error detected in ${normalizedService}\n// Type: ${analysis?.errorType || 'unknown'}\n// Root cause: ${analysis?.rootCause || 'See analysis'}`,
      explanation: `Error in ${normalizedService}: ${analysis?.rootCause || 'Error detected in service'}`,
      suggestionPreview: 'Review service logs and implement proper error handling',
      serviceName: normalizedService,
      serviceDir: sourceCodeManager.mapServiceName(normalizedService),
      confidence: 'low',
      fallback: true
    };
  }
}

module.exports = CodeLocatorAgent;
