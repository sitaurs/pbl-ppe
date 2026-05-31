// lib/connection-test-validation.ts
// Extracted validation logic from POST /api/nodes/test-connection
// Requirements: 10.5

export interface ValidationError {
  error: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
}

/**
 * Validates a connection test request body.
 * Returns { valid: true } if the request is valid,
 * or { valid: false, error: { error, field? } } indicating what's wrong.
 */
export function validateConnectionTestRequest(body: unknown): ValidationResult {
  if (body === null || body === undefined || typeof body !== 'object') {
    return {
      valid: false,
      error: { error: 'Body request tidak valid (bukan JSON)', field: 'body' },
    };
  }

  const req = body as Record<string, unknown>;

  // Validate type parameter
  if (!req.type || (req.type !== 'camera' && req.type !== 'mqtt')) {
    return {
      valid: false,
      error: {
        error: 'Parameter "type" tidak valid. Harus "camera" atau "mqtt".',
        field: 'type',
      },
    };
  }

  // Validate required fields per type
  if (req.type === 'camera') {
    if (!req.url || typeof req.url !== 'string' || (req.url as string).trim() === '') {
      return {
        valid: false,
        error: {
          error: 'Parameter "url" wajib diisi untuk type "camera".',
          field: 'url',
        },
      };
    }
  }

  if (req.type === 'mqtt') {
    if (!req.broker || typeof req.broker !== 'string' || (req.broker as string).trim() === '') {
      return {
        valid: false,
        error: {
          error: 'Parameter "broker" wajib diisi untuk type "mqtt".',
          field: 'broker',
        },
      };
    }
    if (req.port === undefined || req.port === null || typeof req.port !== 'number') {
      return {
        valid: false,
        error: {
          error: 'Parameter "port" wajib diisi (integer) untuk type "mqtt".',
          field: 'port',
        },
      };
    }
    if (!req.username || typeof req.username !== 'string') {
      return {
        valid: false,
        error: {
          error: 'Parameter "username" wajib diisi untuk type "mqtt".',
          field: 'username',
        },
      };
    }
    if (!req.password || typeof req.password !== 'string') {
      return {
        valid: false,
        error: {
          error: 'Parameter "password" wajib diisi untuk type "mqtt".',
          field: 'password',
        },
      };
    }
  }

  return { valid: true };
}
