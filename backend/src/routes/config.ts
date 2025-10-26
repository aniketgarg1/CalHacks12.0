import { Router } from 'express';
export const config = Router();

config.get('/', (_req, res) => {
  res.json({
    vapiPublicKey: process.env.VAPI_PUBLIC_KEY || '',
    vapiAssistantId: process.env.VAPI_ASSISTANT_ID || ''
  });
});
