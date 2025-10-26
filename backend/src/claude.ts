import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
export const MODEL = process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-latest';
