/**
 * Input validation utilities to prevent injection attacks
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: any;
}

/**
 * Validate and sanitize latitude
 */
export function validateLatitude(lat: any): ValidationResult {
  const num = Number(lat);

  if (isNaN(num)) {
    return { valid: false, error: 'Latitude must be a number' };
  }

  if (num < -90 || num > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90' };
  }

  return { valid: true, sanitized: num };
}

/**
 * Validate and sanitize longitude
 */
export function validateLongitude(lon: any): ValidationResult {
  const num = Number(lon);

  if (isNaN(num)) {
    return { valid: false, error: 'Longitude must be a number' };
  }

  if (num < -180 || num > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180' };
  }

  return { valid: true, sanitized: num };
}

/**
 * Validate coordinates object
 */
export function validateCoordinates(coords: any): ValidationResult {
  if (!coords || typeof coords !== 'object') {
    return { valid: false, error: 'Coordinates must be an object' };
  }

  const lat = coords.latitude || coords.lat;
  const lon = coords.longitude || coords.lon;

  const latResult = validateLatitude(lat);
  if (!latResult.valid) {
    return latResult;
  }

  const lonResult = validateLongitude(lon);
  if (!lonResult.valid) {
    return lonResult;
  }

  return {
    valid: true,
    sanitized: {
      latitude: latResult.sanitized,
      longitude: lonResult.sanitized
    }
  };
}

/**
 * Validate string input (prevent XSS)
 */
export function validateString(input: any, maxLength: number = 1000): ValidationResult {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Input must be a string' };
  }

  if (input.length > maxLength) {
    return { valid: false, error: `Input exceeds maximum length of ${maxLength}` };
  }

  // Remove potentially dangerous characters
  const sanitized = input
    .replace(/[<>\"']/g, '') // Remove HTML/JS chars
    .trim();

  return { valid: true, sanitized };
}

/**
 * Validate ID (alphanumeric only)
 */
export function validateId(id: any): ValidationResult {
  if (typeof id !== 'string' && typeof id !== 'number') {
    return { valid: false, error: 'ID must be a string or number' };
  }

  const strId = String(id);

  if (strId.length === 0 || strId.length > 100) {
    return { valid: false, error: 'ID length must be between 1 and 100' };
  }

  // Allow alphanumeric, hyphens, and underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(strId)) {
    return { valid: false, error: 'ID contains invalid characters' };
  }

  return { valid: true, sanitized: strId };
}

/**
 * Validate positive integer
 */
export function validatePositiveInteger(num: any, max: number = 1000): ValidationResult {
  const parsed = parseInt(num, 10);

  if (isNaN(parsed)) {
    return { valid: false, error: 'Must be a valid integer' };
  }

  if (parsed < 1) {
    return { valid: false, error: 'Must be a positive integer' };
  }

  if (parsed > max) {
    return { valid: false, error: `Must not exceed ${max}` };
  }

  return { valid: true, sanitized: parsed };
}

/**
 * Validate array of clients
 */
export function validateClientes(clientes: any): ValidationResult {
  if (!Array.isArray(clientes)) {
    return { valid: false, error: 'Clientes must be an array' };
  }

  if (clientes.length === 0) {
    return { valid: false, error: 'Clientes array cannot be empty' };
  }

  if (clientes.length > 10000) {
    return { valid: false, error: 'Too many clients (max 10000)' };
  }

  // Validate each client
  const sanitized = [];

  for (let i = 0; i < clientes.length; i++) {
    const cliente = clientes[i];

    if (!cliente || typeof cliente !== 'object') {
      return { valid: false, error: `Cliente at index ${i} is invalid` };
    }

    // Validate ID
    const idResult = validateId(cliente.id);
    if (!idResult.valid) {
      return { valid: false, error: `Cliente at index ${i}: ${idResult.error}` };
    }

    // Validate coordinates
    const coordsResult = validateCoordinates(cliente);
    if (!coordsResult.valid) {
      return { valid: false, error: `Cliente at index ${i}: ${coordsResult.error}` };
    }

    // Validate name if present
    let sanitizedNome = cliente.nome || cliente.id;
    if (cliente.nome) {
      const nomeResult = validateString(cliente.nome, 200);
      if (!nomeResult.valid) {
        return { valid: false, error: `Cliente at index ${i}: ${nomeResult.error}` };
      }
      sanitizedNome = nomeResult.sanitized;
    }

    sanitized.push({
      id: idResult.sanitized,
      nome: sanitizedNome,
      latitude: coordsResult.sanitized!.latitude,
      longitude: coordsResult.sanitized!.longitude
    });
  }

  return { valid: true, sanitized };
}

/**
 * Validate date string (ISO format)
 */
export function validateDateString(date: any): ValidationResult {
  if (typeof date !== 'string') {
    return { valid: false, error: 'Date must be a string' };
  }

  const parsed = new Date(date);

  if (isNaN(parsed.getTime())) {
    return { valid: false, error: 'Invalid date format (use ISO 8601)' };
  }

  // Check if date is not too far in the past or future
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const twoYearsAhead = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

  if (parsed < oneYearAgo || parsed > twoYearsAhead) {
    return { valid: false, error: 'Date must be within -1 to +2 years from now' };
  }

  return { valid: true, sanitized: date };
}
