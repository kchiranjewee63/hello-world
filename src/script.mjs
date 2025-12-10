  /**
   * SGNL Hello World HTTP Job
   *
   * Makes a POST request with a hello world message to a specified URL
   * with HTTP Authorization Bearer token.
   */

  import { resolveJSONPathTemplates } from '@sgnl-actions/utils';

  export default {
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

    // Resolve JSONPath templates in params
    const { result: resolvedParams, errors } = resolveJSONPathTemplates(params, jobContext);
    if (errors.length > 0) {
      console.warn('Template resolution errors:', errors);
    }
    console.log('Resolved params:', JSON.stringify(resolvedParams, null, 2));

    const { url, message } = resolvedParams;
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
      message: message || 'Hello World!',
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