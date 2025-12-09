// SGNL Job Script - Auto-generated bundle
'use strict';

/**
 * SGNL Actions - Template Utilities
 *
 * Provides JSONPath-based template resolution for SGNL actions.
 */

/**
 * Regex pattern to match JSONPath templates: {$.path.to.value}
 * Matches patterns starting with {$ and ending with }
 */
const TEMPLATE_PATTERN = /\{(\$[^}]+)\}/g;

/**
 * Regex pattern to match an exact JSONPath template (entire string is a single template)
 */
const EXACT_TEMPLATE_PATTERN = /^\{(\$[^}]+)\}$/;

/**
 * Placeholder for values that cannot be resolved
 */
const NO_VALUE_PLACEHOLDER = '{No Value}';

/**
 * Formats a date to RFC3339 format (without milliseconds) to match Go's time.RFC3339.
 * @param {Date} date - The date to format
 * @returns {string} RFC3339 formatted string (e.g., "2025-12-04T17:30:00Z")
 */
function formatRFC3339(date) {
  // toISOString() returns "2025-12-04T17:30:00.123Z", we need "2025-12-04T17:30:00Z"
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Injects SGNL namespace values into the job context.
 * These are runtime values that should be fresh on each execution.
 *
 * @param {Object} jobContext - The job context object
 * @returns {Object} Job context with sgnl namespace injected
 */
function injectSGNLNamespace(jobContext) {
  const now = new Date();

  return {
    ...jobContext,
    sgnl: {
      ...jobContext?.sgnl,
      time: {
        now: formatRFC3339(now),
        ...jobContext?.sgnl?.time
      }
    }
  };
}

/**
 * Extracts a value from JSON using a simple JSONPath implementation.
 * Supports dot-notation paths like $.user.email and bracket notation like $.users[0].name
 * Does not require external dependencies or vm module.
 *
 * @param {Object} json - The JSON object to extract from
 * @param {string} jsonPath - The JSONPath expression (e.g., "$.user.email")
 * @returns {{ value: any, found: boolean }} The extracted value and whether it was found
 */
function extractJSONPathValue(json, jsonPath) {
  try {
    // Remove leading $ and optional dot
    let path = jsonPath;
    if (path.startsWith('$.')) {
      path = path.slice(2);
    } else if (path.startsWith('$')) {
      path = path.slice(1);
    }

    // Handle empty path (just "$")
    if (!path) {
      return { value: json, found: true };
    }

    // Parse path into segments, handling both dot notation and bracket notation
    // e.g., "user.addresses[0].city" -> ["user", "addresses", "0", "city"]
    const segments = [];
    let current = '';
    let inBracket = false;

    for (let i = 0; i < path.length; i++) {
      const char = path[i];

      if (char === '[' && !inBracket) {
        if (current) {
          segments.push(current);
          current = '';
        }
        inBracket = true;
      } else if (char === ']' && inBracket) {
        if (current) {
          // Remove quotes if present (for bracket notation like ['key'])
          const cleaned = current.replace(/^['"]|['"]$/g, '');
          segments.push(cleaned);
          current = '';
        }
        inBracket = false;
      } else if (char === '.' && !inBracket) {
        if (current) {
          segments.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      segments.push(current);
    }

    // Traverse the object
    let value = json;
    for (const segment of segments) {
      if (value === null || value === undefined) {
        return { value: null, found: false };
      }

      if (typeof value !== 'object') {
        return { value: null, found: false };
      }

      // Handle array index
      if (Array.isArray(value) && /^\d+$/.test(segment)) {
        const index = parseInt(segment, 10);
        if (index < 0 || index >= value.length) {
          return { value: null, found: false };
        }
        value = value[index];
      } else if (Object.prototype.hasOwnProperty.call(value, segment)) {
        value = value[segment];
      } else {
        return { value: null, found: false };
      }
    }

    // Treat null as not found (consistent with original jsonpath-plus behavior)
    if (value === null) {
      return { value: null, found: false };
    }

    return { value, found: true };
  } catch {
    return { value: null, found: false };
  }
}

/**
 * Converts a value to string representation.
 *
 * @param {any} value - The value to convert
 * @returns {string} String representation of the value
 */
function valueToString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

/**
 * Resolves a single template string by replacing all {$.path} patterns with values.
 *
 * @param {string} templateString - The string containing templates
 * @param {Object} jobContext - The job context to resolve templates from
 * @param {Object} [options] - Resolution options
 * @param {boolean} [options.omitNoValueForExactTemplates=false] - If true, exact templates that can't be resolved return empty string
 * @returns {{ result: string, errors: string[] }} The resolved string and any errors
 */
function resolveTemplateString(templateString, jobContext, options = {}) {
  const { omitNoValueForExactTemplates = false } = options;
  const errors = [];

  // Check if the entire string is a single exact template
  const isExactTemplate = EXACT_TEMPLATE_PATTERN.test(templateString);

  const result = templateString.replace(TEMPLATE_PATTERN, (_, jsonPath) => {
    const { value, found } = extractJSONPathValue(jobContext, jsonPath);

    if (!found) {
      errors.push(`failed to extract field '${jsonPath}': field not found`);

      // For exact templates with omitNoValue, return empty string
      if (isExactTemplate && omitNoValueForExactTemplates) {
        return '';
      }

      return NO_VALUE_PLACEHOLDER;
    }

    const strValue = valueToString(value);

    if (strValue === '') {
      errors.push(`failed to extract field '${jsonPath}': field is empty`);
      return '';
    }

    return strValue;
  });

  return { result, errors };
}

/**
 * Resolves JSONPath templates in the input object/string using job context.
 *
 * Template syntax: {$.path.to.value}
 * - {$.user.email} - Extracts user.email from jobContext
 * - {$.sgnl.time.now} - Current RFC3339 timestamp (injected at runtime)
 *
 * @param {Object|string} input - The input containing templates to resolve
 * @param {Object} jobContext - The job context (from context.data) to resolve templates from
 * @param {Object} [options] - Resolution options
 * @param {boolean} [options.omitNoValueForExactTemplates=false] - If true, removes keys where exact templates can't be resolved
 * @param {boolean} [options.injectSGNLNamespace=true] - If true, injects sgnl.time.now
 * @returns {{ result: Object|string, errors: string[] }} The resolved input and any errors encountered
 *
 * @example
 * // Basic usage
 * const jobContext = { user: { email: 'john@example.com' } };
 * const input = { login: '{$.user.email}' };
 * const { result } = resolveJSONPathTemplates(input, jobContext);
 * // result = { login: 'john@example.com' }
 *
 * @example
 * // With runtime values
 * const { result } = resolveJSONPathTemplates(
 *   { timestamp: '{$.sgnl.time.now}' },
 *   {}
 * );
 * // result = { timestamp: '2025-12-04T10:30:00Z' }
 */
function resolveJSONPathTemplates(input, jobContext, options = {}) {
  const {
    omitNoValueForExactTemplates = false,
    injectSGNLNamespace: shouldInjectSgnl = true
  } = options;

  // Inject SGNL namespace if enabled
  const resolvedJobContext = shouldInjectSgnl ? injectSGNLNamespace(jobContext || {}) : (jobContext || {});

  const allErrors = [];

  /**
   * Recursively resolve templates in a value
   */
  function resolveValue(value) {
    if (typeof value === 'string') {
      const { result, errors } = resolveTemplateString(value, resolvedJobContext, { omitNoValueForExactTemplates });
      allErrors.push(...errors);
      return result;
    }

    if (Array.isArray(value)) {
      const resolved = value.map(item => resolveValue(item));
      if (omitNoValueForExactTemplates) {
        return resolved.filter(item => item !== '');
      }
      return resolved;
    }

    if (value !== null && typeof value === 'object') {
      const resolved = {};
      for (const [key, val] of Object.entries(value)) {
        const resolvedVal = resolveValue(val);

        // If omitNoValueForExactTemplates is enabled, skip keys with empty exact template values
        if (omitNoValueForExactTemplates && resolvedVal === '') {
          continue;
        }

        resolved[key] = resolvedVal;
      }
      return resolved;
    }

    // Return non-string primitives as-is
    return value;
  }

  const result = resolveValue(input);

  return { result, errors: allErrors };
}

/**
   * SGNL Hello World HTTP Job
   *
   * Makes a POST request with a hello world message to a specified URL
   * with HTTP Authorization Bearer token.
   */

  var script = {
  /**
   * Main execution handler - sends hello world message via HTTP POST
   * @param {Object} params - Job input parameters
   * @param {Object} context - Execution context with env, secrets, outputs
   * @returns {Object} Job results
   */
  invoke: async (params, context) => {
    console.log('Starting hello world HTTP job execution');

    // Debug logging - inputs
    console.log('=== DEBUG: Input Analysis ===');
    console.log('params type:', typeof params);
    console.log('params keys:', Object.keys(params || {}));
    console.log('params:', JSON.stringify(params, null, 2));
    console.log('params JSON length:', JSON.stringify(params).length);

    console.log('context.data type:', typeof context.data);
    console.log('context.data keys:', Object.keys(context.data || {}));
    console.log('context.data JSON length:', JSON.stringify(context.data || {}).length);

    const jobContext = context.data || {};

    // Call resolveJSONPathTemplates for debugging only
    console.log('=== DEBUG: Calling resolveJSONPathTemplates ===');
    try {
      const result = resolveJSONPathTemplates(params, jobContext, { injectSGNLNamespace: false });
      console.log('=== DEBUG: resolveJSONPathTemplates succeeded ===');
      console.log('resolved result:', JSON.stringify(result.result, null, 2));
      console.log('resolved errors:', result.errors);
    } catch (err) {
      console.error('=== DEBUG: resolveJSONPathTemplates threw an error ===');
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
    }

    // Use original params (not resolved) for actual logic
    const { url } = params;
    const { secrets } = context;

    // Get bearer token from secrets
    const bearerToken = secrets?.bearer_token;
    if (!bearerToken) {
      throw new Error('bearer_token secret is required');
    }

    if (!url) {
      throw new Error('url parameter is required');
    }

    // Build the message payload
    const payload = {
      message: 'Hello World!',
      timestamp: new Date().toISOString()
    };

    console.log(`Sending POST request to: ${url}`);

    // Make the HTTP POST request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`
      },
      body: JSON.stringify(payload)
    });

    const responseStatus = response.status;
    const responseStatusText = response.statusText;

    // Try to get response body
    let responseBody;
    try {
      responseBody = await response.text();
      try {
        responseBody = JSON.parse(responseBody);
      } catch {
        // Keep as text if not valid JSON
      }
    } catch {
      responseBody = null;
    }

    console.log(`Response status: ${responseStatus} ${responseStatusText}`);

    if (!response.ok) {
      console.error(`HTTP request failed: ${responseStatus} ${responseStatusText}`);
      throw new Error(`HTTP request failed with status ${responseStatus}: ${responseStatusText}`);
    }

    console.log('HTTP POST request completed successfully');

    return {
      success: true,
      response_status: responseStatus,
      response_body: responseBody,
      sent_at: payload.timestamp
    };
  },

  /**
   * Error recovery handler
   * @param {Object} params - Original params plus error information
   */
  error: async (params) => {
    const { error, url } = params;
    console.error(`Hello world HTTP job failed for URL ${url}: ${error.message}`);
    throw new Error(`Unrecoverable error: ${error.message}`);
  },

  /**
   * Graceful shutdown handler
   * @param {Object} params - Original params plus halt reason
   */
  halt: async (params) => {
    const { reason } = params;
    console.log(`Job halted: ${reason}`);
  }
  };

module.exports = script;
