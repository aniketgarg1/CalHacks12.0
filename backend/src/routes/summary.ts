import { Router } from 'express';
import { anthropic, MODEL } from '../claude';


export const summary = Router();

summary.post('/', async (req, res) => {
  const utterances = (req.body?.utterances ?? []) as Array<{speaker:string,text:string}>;
  if (!utterances.length) return res.status(400).json({ ok: false, error: 'utterances[] required' });

  try {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 280,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content:
`Create a 4-bullet coaching recap focusing on tone shifts and next steps.
Each bullet <= 14 words.

${JSON.stringify(utterances).slice(0,8000)}`
      }]
    });
    const text = r.content?.[0]?.type === 'text' ? (r.content[0] as any).text : '';
    res.json({ ok: true, summary: text });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'Claude error' });
  }
});
