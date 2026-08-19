import * as validationModule from '../../../enerlectra-core/src/core/services/validation.js';

// Safely extract validateReading, handling both ES Module and CommonJS fallback states
export const validateReading = (
  validationModule.validateReading ?? 
  (validationModule as any).default?.validateReading
) as typeof validationModule.validateReading;

// Re-export the validation types so the server doesn't lose type-safety
export type { 
  ValidationContext, 
  ValidationResult 
} from '../../../enerlectra-core/src/core/services/validation.js';