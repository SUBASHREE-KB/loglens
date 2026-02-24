/**
 * Code Fix Agent
 * Reads actual source code and generates targeted fixes
 */

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { PromptTemplate } = require('@langchain/core/prompts');
const fs = require('fs').promises;
const path = require('path');
const sourceCodeManager = require('../services/SourceCodeManager');

class CodeFixAgent {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[CodeFixAgent] No API key provided - AI code fixing will be disabled');
      this.model = null;
      return;
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: 'gemini-2.5-flash',
      temperature: 0.1, // Low temperature for precise code generation
      maxOutputTokens: 8192  // Increased to prevent JSON truncation
    });

    this.timeout = 90000; // 90 second timeout for code analysis (Gemini can be slow)

    // Prompt for analyzing code and generating fixes
    this.analyzePrompt = PromptTemplate.fromTemplate(`
You are an expert software engineer. Analyze this source code and the error that occurred.

SOURCE FILE: {filePath}
\`\`\`javascript
{sourceCode}
\`\`\`

ERROR INFORMATION:
- Error Message: {errorMessage}
- Error Type: {errorType}
- Root Cause: {rootCause}
- Origin Service: {originService}

TASK: Identify the EXACT code that causes this error and provide a targeted fix.

Rules:
1. Find the specific lines of code that cause the error
2. Provide the EXACT old code that needs to be replaced (copy it exactly as it appears, preserving indentation)
3. Provide the new code that fixes the issue - NEVER leave newCode empty
4. The fix should be minimal - only change what's necessary
5. Do NOT add new utility functions unless absolutely required
6. If the error is caused by simulated/random failures (Math.random or DEMO_MODE), COMMENT OUT the code block with "// DISABLED:" prefix instead of deleting it. This preserves the code for reference.
7. If the error is a timeout, add proper timeout handling at the exact location
8. If the error is null/undefined, add proper null checks at the exact location
9. IMPORTANT: The newCode field must NEVER be empty. If removing code, comment it out instead.

Respond ONLY with valid JSON (no markdown, no backticks):
{{
  "found": true,
  "problemLocation": {{
    "startLine": <line number where problem starts>,
    "endLine": <line number where problem ends>,
    "description": "brief description of what this code does wrong"
  }},
  "oldCode": "<exact code to replace - copy exactly from source with indentation>",
  "newCode": "<fixed code - if disabling, comment out with // DISABLED: prefix>",
  "explanation": "brief explanation of what the fix does",
  "confidence": "high|medium|low"
}}

If you cannot identify the exact problematic code, respond with:
{{
  "found": false,
  "reason": "explanation of why the fix cannot be determined",
  "suggestion": "manual steps the developer should take"
}}
`);

    console.log('[CodeFixAgent] Initialized with Gemini model');
  }

  /**
   * Read source file using SourceCodeManager
   * Respects user's configured source code mode (local path or GitHub)
   * @param {string} serviceName - Name of the service (e.g., 'api-gateway', 'user-service')
   * @param {string} fileName - Name of the file (e.g., 'index.js')
   * @returns {Promise<{content: string, filePath: string, source: string}>}
   */
  async readSourceFile(serviceName, fileName = 'index.js') {
    // Use SourceCodeManager to read file (respects user's configured path)
    const result = await sourceCodeManager.readFile(serviceName, fileName);

    if (result && result.content) {
      console.log(`[CodeFixAgent] Read source file via SourceCodeManager: ${result.path} (${result.source})`);
      return {
        content: result.content,
        filePath: result.path,
        source: result.source
      };
    }

    // Try database.js for user-service if index.js not found
    const mappedService = sourceCodeManager.mapServiceName(serviceName);
    if (mappedService === 'user-service' && fileName === 'index.js') {
      const dbResult = await sourceCodeManager.readFile(serviceName, 'database.js');
      if (dbResult && dbResult.content) {
        console.log(`[CodeFixAgent] Read database.js via SourceCodeManager: ${dbResult.path}`);
        return {
          content: dbResult.content,
          filePath: dbResult.path,
          source: dbResult.source
        };
      }
    }

    throw new Error(`Could not find source file for service: ${serviceName} (mode: ${sourceCodeManager.mode})`);
  }

  /**
   * Determine which file likely contains the error
   * @param {object} analysis - Error analysis from AnalyzerAgent
   * @returns {string[]} - List of files to check
   */
  getFilesToCheck(analysis) {
    const files = [];

    // Check database.js FIRST for database-related errors (most timeout errors are here)
    if (analysis.errorType === 'database_timeout' ||
        analysis.errorType === 'connection_pool_exhaustion' ||
        analysis.rootCause?.toLowerCase().includes('database') ||
        analysis.rootCause?.toLowerCase().includes('timeout') ||
        analysis.rootCause?.toLowerCase().includes('query') ||
        analysis.rootCause?.toLowerCase().includes('connection')) {
      files.push('database.js');
    }

    // Always check index.js
    files.push('index.js');

    return files;
  }

  /**
   * Generate a targeted fix for an error
   * @param {object} analysis - Error analysis from AnalyzerAgent
   * @returns {Promise<object>} - Fix details
   */
  async generateFix(analysis) {
    console.log('[CodeFixAgent] Generating fix for:', analysis.originService);

    if (!this.model) {
      return this.generateBasicFix(analysis);
    }

    const serviceName = analysis.originService || 'user-service';
    const filesToCheck = this.getFilesToCheck(analysis);

    let bestFix = null;

    for (const fileName of filesToCheck) {
      try {
        // Read the actual source code
        const { content, filePath } = await this.readSourceFile(serviceName, fileName);

        // Generate fix using AI
        const fix = await this.analyzeAndFix(content, filePath, analysis);

        if (fix.found && (!bestFix || fix.confidence === 'high')) {
          bestFix = { ...fix, filePath, fileName };
          if (fix.confidence === 'high') break;
        }
      } catch (err) {
        console.log(`[CodeFixAgent] Could not check ${fileName}:`, err.message);
      }
    }

    if (bestFix) {
      return {
        success: true,
        filePath: bestFix.filePath,
        fileName: bestFix.fileName,
        oldCode: bestFix.oldCode,
        newCode: bestFix.newCode,
        explanation: bestFix.explanation,
        problemLocation: bestFix.problemLocation,
        confidence: bestFix.confidence
      };
    }

    // Fall back to basic fix if AI couldn't find specific code
    return this.generateBasicFix(analysis);
  }

  /**
   * Use AI to analyze code and generate fix
   */
  async analyzeAndFix(sourceCode, filePath, analysis) {
    try {
      const prompt = await this.analyzePrompt.format({
        filePath: filePath,
        sourceCode: sourceCode,
        errorMessage: analysis.rootCause || 'Unknown error',
        errorType: analysis.errorType || 'unknown',
        rootCause: analysis.rootCause || 'Unknown',
        originService: analysis.originService || 'Unknown'
      });

      console.log('[CodeFixAgent] Sending code to AI for analysis...');

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timeout')), this.timeout)
      );

      const response = await Promise.race([
        this.model.invoke(prompt),
        timeoutPromise
      ]);

      return this.parseResponse(response.content, sourceCode);
    } catch (error) {
      console.error('[CodeFixAgent] AI analysis failed:', error.message);
      return { found: false, reason: error.message };
    }
  }

  /**
   * Parse AI response
   */
  parseResponse(content, sourceCode) {
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate the fix - make sure oldCode exists in source
        if (parsed.found && parsed.oldCode) {
          // Normalize whitespace for comparison
          const normalizedOld = parsed.oldCode.trim();
          const normalizedSource = sourceCode;

          if (!normalizedSource.includes(normalizedOld)) {
            console.log('[CodeFixAgent] Warning: oldCode not found exactly in source, attempting fuzzy match');

            // Try to find similar code
            const lines = normalizedOld.split('\n');
            const firstLine = lines[0].trim();

            if (normalizedSource.includes(firstLine)) {
              console.log('[CodeFixAgent] Found partial match, proceeding with fix');
            } else {
              parsed.confidence = 'low';
              parsed.warning = 'Code match is approximate';
            }
          }

          // SAFEGUARD: If newCode is empty, comment out the old code instead
          if (!parsed.newCode || parsed.newCode.trim() === '') {
            console.log('[CodeFixAgent] newCode is empty, converting to commented code');
            const commentedLines = parsed.oldCode.split('\n').map(line => {
              const trimmed = line.trim();
              if (trimmed === '') return line;
              // Preserve indentation, add comment
              const indent = line.match(/^(\s*)/)[1];
              return indent + '// DISABLED: ' + trimmed;
            });
            parsed.newCode = commentedLines.join('\n');
          }
        }

        return parsed;
      }

      return { found: false, reason: 'Could not parse AI response' };
    } catch (error) {
      console.error('[CodeFixAgent] Parse error:', error.message);
      return { found: false, reason: 'Parse error: ' + error.message };
    }
  }

  /**
   * Generate basic fix when AI is unavailable
   */
  async generateBasicFix(analysis) {
    console.log('[CodeFixAgent] Generating basic fix without AI');

    const serviceName = (analysis.originService || 'user-service').toLowerCase().replace(/[_\s]/g, '-');
    const errorType = analysis.errorType || 'unknown';

    // Get files to check based on error type
    const filesToCheck = this.getFilesToCheck(analysis);

    // Try each file
    for (const fileName of filesToCheck) {
      try {
        const result = await this.readSourceFile(serviceName, fileName);
        const sourceContent = result.content;
        const filePath = result.filePath;

        console.log(`[CodeFixAgent] Checking ${fileName} for patterns...`);

        // Pattern-based fixes
        const fixes = this.findPatternBasedFix(sourceContent, errorType, analysis);

        if (fixes) {
          console.log(`[CodeFixAgent] Found fix in ${fileName}`);
          return {
            success: true,
            filePath: filePath,
            fileName: fileName,
            oldCode: fixes.oldCode,
            newCode: fixes.newCode,
            explanation: fixes.explanation,
            confidence: 'medium',
            isPatternBased: true
          };
        }
      } catch (err) {
        console.log(`[CodeFixAgent] Could not read ${fileName}: ${err.message}`);
      }
    }

    return {
      success: false,
      error: 'Could not determine automatic fix',
      suggestion: analysis.immediateActions?.join('; ') || 'Please check the service logs'
    };
  }

  /**
   * Find fixes based on common error patterns
   */
  findPatternBasedFix(sourceCode, errorType, analysis) {
    const lines = sourceCode.split('\n');

    // Guard: Skip if error type has already been fixed (check for DISABLED comment)
    const alreadyFixedPattern = new RegExp(`// DISABLED:.*${errorType}`, 'i');
    if (alreadyFixedPattern.test(sourceCode)) {
      console.log(`[CodeFixAgent] Error type "${errorType}" appears to be already fixed`);
      return null;
    }

    // Pattern 1: Random error simulation with SIMULATE_ERRORS or DEMO_MODE flag
    // Note: Pattern allows optional { at the end to match "if (DEMO_MODE && Math.random() < 0.08) {"
    const simulateErrorPattern = /if\s*\(\s*(SIMULATE_ERRORS|DEMO_MODE)\s*&&\s*Math\.random\(\)\s*<\s*[\d.]+\s*\)\s*\{?/;
    // Pattern 1b: Random error simulation without flag (legacy)
    const randomErrorPattern = /if\s*\(\s*Math\.random\(\)\s*<\s*[\d.]+\s*\)\s*\{/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip already commented lines
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
        continue;
      }

      // Check for SIMULATE_ERRORS pattern first
      if (simulateErrorPattern.test(line)) {
        // Find the closing brace
        let braceCount = 0;
        let endLine = i;
        let started = false;

        for (let j = i; j < lines.length; j++) {
          const openBraces = (lines[j].match(/\{/g) || []).length;
          const closeBraces = (lines[j].match(/\}/g) || []).length;

          if (openBraces > 0) started = true;
          braceCount += openBraces;
          braceCount -= closeBraces;

          if (started && braceCount === 0) {
            endLine = j;
            break;
          }
        }

        const oldCode = lines.slice(i, endLine + 1).join('\n');

        // Comment out the entire block
        const commentedCode = lines.slice(i, endLine + 1)
          .map(l => '    // ' + l.trim())
          .join('\n');

        const newCode = `    // DISABLED: Simulated error removed to fix ${errorType}\n${commentedCode}`;

        return {
          oldCode,
          newCode,
          explanation: `Disabled simulated error (SIMULATE_ERRORS block) that was causing ${errorType} failures. The random failure simulation has been commented out.`
        };
      }

      // Check for legacy pattern without SIMULATE_ERRORS or DEMO_MODE
      if (randomErrorPattern.test(line) && !line.includes('SIMULATE_ERRORS') && !line.includes('DEMO_MODE')) {
        let braceCount = 0;
        let endLine = i;

        for (let j = i; j < lines.length; j++) {
          braceCount += (lines[j].match(/\{/g) || []).length;
          braceCount -= (lines[j].match(/\}/g) || []).length;
          if (braceCount === 0) {
            endLine = j;
            break;
          }
        }

        const oldCode = lines.slice(i, endLine + 1).join('\n');
        const commentedCode = lines.slice(i, endLine + 1)
          .map(l => '    // ' + l.trim())
          .join('\n');

        const newCode = `    // DISABLED: Simulated error removed to fix ${errorType}\n${commentedCode}`;

        return {
          oldCode,
          newCode,
          explanation: `Disabled simulated random error that was causing ${errorType} failures`
        };
      }
    }

    // Pattern 2: Database timeout simulation in acquireConnection
    if (errorType === 'database_timeout') {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Database connection timeout') ||
            lines[i].includes('setTimeout') && lines.slice(Math.max(0, i-3), i+1).join('').includes('timeout')) {

          // Look back to find the start of the if block
          let startLine = i;
          for (let j = i; j >= Math.max(0, i - 10); j--) {
            if (lines[j].includes('if') && (lines[j].includes('SIMULATE_ERRORS') || lines[j].includes('DEMO_MODE') || lines[j].includes('Math.random'))) {
              startLine = j;
              break;
            }
          }

          // Find the end of this block
          let braceCount = 0;
          let endLine = i;
          let started = false;

          for (let j = startLine; j < lines.length; j++) {
            const openBraces = (lines[j].match(/\{/g) || []).length;
            const closeBraces = (lines[j].match(/\}/g) || []).length;

            if (openBraces > 0) started = true;
            braceCount += openBraces;
            braceCount -= closeBraces;

            if (started && braceCount === 0) {
              endLine = j;
              break;
            }
          }

          if (startLine < i) {
            const oldCode = lines.slice(startLine, endLine + 1).join('\n');
            const commentedCode = lines.slice(startLine, endLine + 1)
              .map(l => '    // ' + l.trim())
              .join('\n');

            const newCode = `    // DISABLED: Database timeout simulation removed\n${commentedCode}`;

            return {
              oldCode,
              newCode,
              explanation: `Disabled database timeout simulation that was causing connection failures`
            };
          }
        }
      }
    }

    // Pattern 3: Connection pool exhaustion simulation
    if (errorType === 'connection_pool_exhaustion') {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('pool exhausted') || lines[i].includes('Connection pool exhausted')) {
          // Look back to find the start of the if block
          let startLine = i;
          for (let j = i; j >= Math.max(0, i - 10); j--) {
            if (lines[j].includes('if') && (lines[j].includes('SIMULATE_ERRORS') || lines[j].includes('DEMO_MODE') || lines[j].includes('Math.random'))) {
              startLine = j;
              break;
            }
          }

          let braceCount = 0;
          let endLine = i;
          let started = false;

          for (let j = startLine; j < lines.length; j++) {
            const openBraces = (lines[j].match(/\{/g) || []).length;
            const closeBraces = (lines[j].match(/\}/g) || []).length;

            if (openBraces > 0) started = true;
            braceCount += openBraces;
            braceCount -= closeBraces;

            if (started && braceCount === 0) {
              endLine = j;
              break;
            }
          }

          if (startLine < i) {
            const oldCode = lines.slice(startLine, endLine + 1).join('\n');
            const commentedCode = lines.slice(startLine, endLine + 1)
              .map(l => '    // ' + l.trim())
              .join('\n');

            const newCode = `    // DISABLED: Connection pool exhaustion simulation removed\n${commentedCode}`;

            return {
              oldCode,
              newCode,
              explanation: `Disabled connection pool exhaustion simulation`
            };
          }
        }
      }
    }

    // Pattern 4: Memory leak simulation
    if (errorType === 'memory_leak') {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('memory') && lines[i].includes('leak') ||
            lines[i].includes('Memory usage critically high') ||
            lines[i].includes('heapUsedMB') && lines[i].includes('heapTotalMB')) {
          // Look back to find the start of the if block
          let startLine = i;
          for (let j = i; j >= Math.max(0, i - 10); j--) {
            if (lines[j].includes('if') && (lines[j].includes('SIMULATE_ERRORS') || lines[j].includes('DEMO_MODE') || lines[j].includes('Math.random'))) {
              startLine = j;
              break;
            }
          }

          let braceCount = 0;
          let endLine = i;
          let started = false;

          for (let j = startLine; j < lines.length; j++) {
            const openBraces = (lines[j].match(/\{/g) || []).length;
            const closeBraces = (lines[j].match(/\}/g) || []).length;

            if (openBraces > 0) started = true;
            braceCount += openBraces;
            braceCount -= closeBraces;

            if (started && braceCount === 0) {
              endLine = j;
              break;
            }
          }

          if (startLine < i) {
            const oldCode = lines.slice(startLine, endLine + 1).join('\n');
            const commentedCode = lines.slice(startLine, endLine + 1)
              .map(l => '    // ' + l.trim())
              .join('\n');

            const newCode = `    // DISABLED: Memory leak simulation removed\n${commentedCode}`;

            return {
              oldCode,
              newCode,
              explanation: `Disabled memory leak simulation that was causing false memory warnings`
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Apply a fix to a file
   * @param {string} filePath - Path to the file
   * @param {string} oldCode - Code to replace
   * @param {string} newCode - New code
   * @returns {Promise<{success: boolean, backup: string}>}
   */
  async applyFix(filePath, oldCode, newCode) {
    // Guard: Cannot auto-apply fixes in GitHub mode
    if (sourceCodeManager.mode === 'github') {
      console.log('[CodeFixAgent] GitHub mode detected - cannot auto-apply fixes');
      return {
        success: false,
        error: 'Auto-apply is not supported for GitHub repositories. Please copy the fix and apply it manually via a pull request.',
        requiresManualApply: true,
        mode: 'github'
      };
    }

    try {
      // Read current content
      let content = await fs.readFile(filePath, 'utf-8');

      // Normalize line endings
      content = content.replace(/\r\n/g, '\n');
      oldCode = oldCode.replace(/\r\n/g, '\n');
      newCode = newCode.replace(/\r\n/g, '\n');

      // Create backup
      const backupPath = filePath + '.backup.' + Date.now();
      await fs.writeFile(backupPath, content, 'utf-8');
      console.log(`[CodeFixAgent] Created backup: ${backupPath}`);

      // Try exact match first
      if (content.includes(oldCode)) {
        const newContent = content.replace(oldCode, newCode);
        await fs.writeFile(filePath, newContent, 'utf-8');
        console.log(`[CodeFixAgent] Applied fix (exact match) to: ${filePath}`);
        return { success: true, backup: backupPath };
      }

      // Try matching with normalized whitespace (trim each line)
      const normalizeWhitespace = (code) => {
        return code.split('\n').map(line => line.trim()).join('\n');
      };

      const normalizedContent = normalizeWhitespace(content);
      const normalizedOld = normalizeWhitespace(oldCode);

      if (normalizedContent.includes(normalizedOld)) {
        // Find the actual code block in original content
        const oldLines = oldCode.split('\n').map(l => l.trim()).filter(l => l);
        const contentLines = content.split('\n');

        // Find the first line of oldCode in content
        let startIdx = -1;
        for (let i = 0; i < contentLines.length; i++) {
          if (contentLines[i].trim() === oldLines[0]) {
            // Check if subsequent lines match
            let match = true;
            let j = 0;
            for (let k = i; k < contentLines.length && j < oldLines.length; k++) {
              const trimmedLine = contentLines[k].trim();
              if (trimmedLine === '') continue; // Skip empty lines
              if (trimmedLine !== oldLines[j]) {
                match = false;
                break;
              }
              j++;
            }
            if (match && j === oldLines.length) {
              startIdx = i;
              break;
            }
          }
        }

        if (startIdx >= 0) {
          // Find how many lines to replace
          let endIdx = startIdx;
          let matchedLines = 0;
          for (let i = startIdx; i < contentLines.length && matchedLines < oldLines.length; i++) {
            if (contentLines[i].trim() !== '') {
              matchedLines++;
            }
            endIdx = i;
          }

          // Get the indentation of the first line
          const indent = contentLines[startIdx].match(/^(\s*)/)[1];

          // Apply indentation to new code
          const newCodeLines = newCode.split('\n').map((line, idx) => {
            if (idx === 0 || line.trim() === '') return line;
            return indent + line.trim();
          });

          // Replace the lines
          contentLines.splice(startIdx, endIdx - startIdx + 1, ...newCodeLines);
          const newContent = contentLines.join('\n');

          await fs.writeFile(filePath, newContent, 'utf-8');
          console.log(`[CodeFixAgent] Applied fix (fuzzy match) to: ${filePath}`);
          return { success: true, backup: backupPath };
        }
      }

      // Last resort: try finding key patterns
      console.error('[CodeFixAgent] Could not find matching code. Old code:', oldCode.substring(0, 200));
      throw new Error('Could not find exact code to replace. The source code may have changed.');
    } catch (error) {
      console.error(`[CodeFixAgent] Failed to apply fix: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = CodeFixAgent;
