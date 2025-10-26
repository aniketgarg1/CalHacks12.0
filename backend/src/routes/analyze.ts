import { Router } from 'express';
import { z } from 'zod';
import { anthropic, MODEL } from '../claude';

export const analyze = Router();

const Body = z.object({
  text: z.string().min(1),
  context: z.string().optional()
});

// helper: extract first {...} block and parse
function parseJsonFromText(t: string) {
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}$/); // grab largest JSON-looking block
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

analyze.post('/', async (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  const { text, context } = parsed.data;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 180,
      temperature: 0, // <- deterministic
      system: 'You are a JSON generator. Return ONLY minified JSON. No prose. No markdown. No code fences.',
      messages: [{
        role: 'user',
        content:
`Fill this JSON for the CUSTOMER utterance below. Keep bullets <= 12 words.
Return exactly this shape (minified):
{"tone":"","confidence":3,"bullets":["","",""],"evidence":""}

Constraints:
- tone ∈ ["calm","confident","neutral","anxious","frustrated","defensive","uncertain","upbeat"]
- confidence ∈ 1..5
- bullets: 3 owner-facing actions, short and specific
- evidence: brief clause citing the customer's phrasing
Context: ${context ?? "general"}
Utterance: """${text}"""`}]
    });

    const raw = msg.content?.[0]?.type === 'text' ? (msg.content[0] as any).text : '';
    const data = parseJsonFromText(raw) ?? {
      tone: 'neutral',
      confidence: 3,
      bullets: ['Acknowledge once.', 'Give ETA + next step.', 'Offer small make-good.'],
      evidence: 'fallback parser'
    };

    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? 'Claude error' });
  }
});
