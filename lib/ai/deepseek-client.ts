import OpenAI from 'openai';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODEL = 'deepseek-chat';

export function createDeepSeekClient(apiKeyOverride?: string): OpenAI {
  const apiKey = apiKeyOverride ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[DeepSeek] DEEPSEEK_API_KEY is not configured in environment variables');
  }

  return new OpenAI({
    baseURL: DEEPSEEK_BASE_URL,
    apiKey: apiKey || 'missing-api-key',
  });
}

export const deepseek = createDeepSeekClient();
