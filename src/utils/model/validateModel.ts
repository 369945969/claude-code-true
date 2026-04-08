// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { MODEL_ALIASES } from './aliases.js'
import { isModelAllowed } from './modelAllowlist.js'
import { getAPIProvider } from './providers.js'
import { sideQuery } from '../sideQuery.js'
import {
  NotFoundError,
  APIError,
  APIConnectionError,
  AuthenticationError,
} from '@anthropic-ai/sdk'
import { getModelStrings } from './modelStrings.js'
import { getOpenAIClient } from '../../services/api/openai/client.js'
import { resolveOpenAIModel } from '../../services/api/openai/modelMapping.js'

declare const process: { env: Record<string, string | undefined> }

// Cache valid models to avoid repeated API calls
const validModelCache = new Map<string, boolean>()

/**
 * Validates a model by attempting an actual API call.
 */
export async function validateModel(
  model: string,
): Promise<{ valid: boolean; error?: string }> {
  const normalizedModel = model.trim()
  const provider = getAPIProvider()
  const cacheKey = `${provider}:${normalizedModel}`

  // Empty model is invalid
  if (!normalizedModel) {
    return { valid: false, error: 'Model name cannot be empty' }
  }

  // Check against availableModels allowlist before any API call
  if (!isModelAllowed(normalizedModel)) {
    return {
      valid: false,
      error: `Model '${normalizedModel}' is not in the list of available models`,
    }
  }

  // Check if it's a known alias (these are always valid)
  const lowerModel = normalizedModel.toLowerCase()
  if ((MODEL_ALIASES as readonly string[]).includes(lowerModel)) {
    return { valid: true }
  }

  // Check if it matches ANTHROPIC_CUSTOM_MODEL_OPTION (pre-validated by the user)
  if (normalizedModel === process.env.ANTHROPIC_CUSTOM_MODEL_OPTION) {
    return { valid: true }
  }

  // Check cache first
  if (validModelCache.has(cacheKey)) {
    return { valid: true }
  }


  try {
    if (provider === 'openai') {
      const openaiModel = resolveOpenAIModel(normalizedModel)
      const client = getOpenAIClient({ maxRetries: 0 })
      await client.chat.completions.create({
        model: openaiModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
      })
      validModelCache.set(cacheKey, true)
      return { valid: true }
    }

    await sideQuery({
      model: normalizedModel,
      max_tokens: 1,
      maxRetries: 0,
      querySource: 'model_validation',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hi',
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
      ],
    })

    validModelCache.set(cacheKey, true)
    return { valid: true }
  } catch (error) {
    if (provider === 'openai') {
      return handleOpenAIValidationError(error, normalizedModel)
    }
    return handleValidationError(error, normalizedModel)
  }
}

function handleValidationError(
  error: unknown,
  modelName: string,
): { valid: boolean; error: string } {
  // NotFoundError (404) means the model doesn't exist
  if (error instanceof NotFoundError) {
    const fallback = get3PFallbackSuggestion(modelName)
    const suggestion = fallback ? `. Try '${fallback}' instead` : ''
    return {
      valid: false,
      error: `Model '${modelName}' not found${suggestion}`,
    }
  }

  // For other API errors, provide context-specific messages
  if (error instanceof APIError) {
    const apiError = error as any
    if (error instanceof AuthenticationError) {
      return {
        valid: false,
        error: 'Authentication failed. Please check your API credentials.',
      }
    }

    if (error instanceof APIConnectionError) {
      return {
        valid: false,
        error: 'Network error. Please check your internet connection.',
      }
    }

    // Check error body for model-specific errors
    const errorBody = apiError.error as unknown
    if (
      errorBody &&
      typeof errorBody === 'object' &&
      'type' in errorBody &&
      errorBody.type === 'not_found_error' &&
      'message' in errorBody &&
      typeof errorBody.message === 'string' &&
      errorBody.message.includes('model:')
    ) {
      return { valid: false, error: `Model '${modelName}' not found` }
    }

    // Generic API error
    return {
      valid: false,
      error: `API error: ${typeof apiError.message === 'string' ? apiError.message : 'Unknown error'}`,
    }
  }

  // For unknown errors, be safe and reject
  const errorMessage = error instanceof Error ? error.message : String(error)
  return {
    valid: false,
    error: `Unable to validate model: ${errorMessage}`,
  }
}

// @[MODEL LAUNCH]: Add a fallback suggestion chain for the new model → previous version
/**
 * Suggest a fallback model for 3P users when the selected model is unavailable.
 */
function get3PFallbackSuggestion(model: string): string | undefined {
  if (getAPIProvider() === 'firstParty') {
    return undefined
  }
  const lowerModel = model.toLowerCase()
  if (lowerModel.includes('opus-4-6') || lowerModel.includes('opus_4_6')) {
    return getModelStrings().opus41
  }
  if (lowerModel.includes('sonnet-4-6') || lowerModel.includes('sonnet_4_6')) {
    return getModelStrings().sonnet45
  }
  if (lowerModel.includes('sonnet-4-5') || lowerModel.includes('sonnet_4_5')) {
    return getModelStrings().sonnet40
  }
  return undefined
}

function handleOpenAIValidationError(
  error: unknown,
  modelName: string,
): { valid: boolean; error: string } {
  const openaiModel = resolveOpenAIModel(modelName)

  const anyErr = error as any
  const status =
    typeof anyErr?.status === 'number'
      ? (anyErr.status as number)
      : typeof anyErr?.statusCode === 'number'
        ? (anyErr.statusCode as number)
        : undefined
  const message =
    typeof anyErr?.message === 'string' ? anyErr.message : String(error)

  if (status === 401 || status === 403) {
    return {
      valid: false,
      error: 'Authentication failed. Please check your OpenAI API credentials.',
    }
  }

  if (status === 404 || /model/i.test(message) && /not\s*found/i.test(message)) {
    if (openaiModel !== modelName) {
      return {
        valid: false,
        error: `Model '${modelName}' maps to '${openaiModel}' but the OpenAI endpoint does not recognize it. Configure OPENAI_MODEL or OPENAI_DEFAULT_*_MODEL.`,
      }
    }
    return { valid: false, error: `Model '${modelName}' not found` }
  }

  const networkHints = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'fetch failed',
  ]
  if (networkHints.some(h => message.includes(h))) {
    return {
      valid: false,
      error:
        'Network error. Please check OPENAI_BASE_URL and that the endpoint is reachable.',
    }
  }

  return { valid: false, error: `API error: ${message}` }
}
