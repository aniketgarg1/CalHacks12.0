// -------------------------------------------------------------
// ToneCoach front-end  (clean UI, customer-only + debounced coaching)
// -------------------------------------------------------------

const API = 'http://localhost:4000';

let CFG = { vapiPublicKey: '', vapiAssistantId: '' };
let vapi = null;
let listening = false;

// conversation log for summary
const convo = []; // { speaker: 'customer' | 'owner', text: string }

// ---------- Tiny UI helpers ----------
const $ = (id) => document.getElementById(id);
const toneClass = (tone) => 'tone tone-' + String(tone || 'neutral').toLowerCase();
const setStatus = (s) => { const el = $('status'); if (el) el.textContent = s; };
const emojiMap = {
  frustrated: '😠', anxious: '😟', defensive: '😤', uncertain: '🤔',
  neutral: '😐', calm: '🙂', upbeat: '😄', confident: '😎'
};
const setEmoji = (tone) => { const el = $('emoji'); if (el) el.textContent = emojiMap[tone] || '😐'; };
const fail = (msg) => { console.error(msg); alert(msg); };

// ---------- Tabs ----------
function gotoTab(key) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-screen') === key);
  });
  document.querySelectorAll('section[id^="screen-"]').forEach(sec => {
    sec.style.display = sec.id === 'screen-' + key ? '' : 'none';
  });
}
(function wireTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => gotoTab(tab.getAttribute('data-screen')));
  });
})();

// ---------- Advice UI ----------
function showAdvice(out) {
  setEmoji(out.tone);
  const badge = $('toneBadge');
  if (badge) {
    badge.textContent = out.tone;
    badge.className = toneClass(out.tone);
  }
  const ul = $('bullets');
  if (ul) {
    ul.innerHTML = '';
    (out.bullets || []).forEach((b) => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    });
  }
  const why = $('why');
  if (why) why.textContent = 'Why: ' + out.evidence + ' • Confidence: ' + out.confidence + '/5';
}

// ---------- Speaker utils ----------
function lower(x){ return String(x||'').toLowerCase(); }

function extractRawSpeaker(evt){
  let r = evt?.role ?? evt?.speaker ?? evt?.participant ?? evt?.channel;
  if (r) return String(r);
  if (evt?.metadata?.speaker !== undefined) return String(evt.metadata.speaker);
  if (evt?.metadata?.channel !== undefined) return String(evt.metadata.channel);
  if (Array.isArray(evt?.messages) && evt.messages.length) {
    const last = evt.messages[evt.messages.length-1];
    if (last?.role) return String(last.role);
  }
  if (Array.isArray(evt?.conversation) && evt.conversation.length) {
    const last = evt.conversation[evt.conversation.length-1];
    if (last?.role) return String(last.role);
  }
  return '';
}

// CUSTOMER-only coaching.
// Treat Vapi assistant speech as 'customer'; everything else as 'owner'.
function mapSide(evt) {
  const role = lower(extractRawSpeaker(evt));
  const isAssistant = role === 'assistant'; // Vapi's spoken output
  return isAssistant ? 'customer' : 'owner';
}

// ---------- Coaching throttles (debounce + cooldown) ----------
const ANALYZE_DEBOUNCE_MS = 1200;  // wait this quiet time before analyzing
const ANALYZE_COOLDOWN_MS = 4000;  // minimum gap between analyses
const MIN_CUSTOMER_CHARS   = 12;   // ignore tiny blurts

let customerBuffer = '';
let debounceTimer  = null;
let lastAnalyzeAt  = 0;

function queueCustomerText(t) {
  customerBuffer = customerBuffer ? (customerBuffer + ' ' + t) : t;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushCustomerAnalysis, ANALYZE_DEBOUNCE_MS);
}

async function flushCustomerAnalysis() {
  debounceTimer = null;

  const now = Date.now();
  if (now - lastAnalyzeAt < ANALYZE_COOLDOWN_MS) return;
  const text = (customerBuffer || '').trim();
  if (text.length < MIN_CUSTOMER_CHARS) return;

  try {
    const r = await fetch(API + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context: 'agentic-ai', side: 'customer' })
    });
    const j = await r.json();
    if (j && j.ok) showAdvice(j);
    lastAnalyzeAt = Date.now();
  } catch (e) {
    console.error('Analyze error:', e);
  } finally {
    customerBuffer = '';
  }
}

// ---------- Transcript → log + (customer-only) analyze (debounced) ----------
async function handleTranscript(evt) {
  const text = evt?.text ?? evt?.transcript ?? evt?.output ?? '';
  const isFinal =
    (evt?.is_final === true) ||
    (evt?.final === true) ||
    (lower(evt?.transcriptType) === 'final') ||
    (lower(evt?.status) === 'final');

  if (!text || !isFinal) return;

  const side = mapSide(evt); // 'customer' | 'owner'

  // Log both sides for summary
  convo.push({ speaker: side, text });
  const sj = $('summaryJson');
  if (sj) sj.value = JSON.stringify(convo, null, 2);

  // LIVE coaching ONLY for customer lines (debounced)
  if (side === 'customer') {
    queueCustomerText(text);
    // quick flush if sentence clearly ends
    if (/[.?!]$/.test(text.trim())) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushCustomerAnalysis, 300);
    }
  }
}

// ---------- Summarize ----------
async function doSummarize() {
  try {
    const r = await fetch(API + '/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utterances: convo })
    });
    const j = await r.json();
    $('summaryOut').textContent = j.summary || '(no summary)';
    gotoTab('summary');
  } catch (e) {
    fail('Network error calling /api/summary');
  }
}
$('summaryBtn')?.addEventListener('click', doSummarize);

// ---------- Vapi ----------
async function startVapi() {
  try {
    if (!CFG.vapiPublicKey || !CFG.vapiAssistantId) {
      return fail('Vapi config missing from backend (/api/config).');
    }
    if (!window.createVapi) {
      return fail('Vapi SDK not loaded. Check the <script type="module"> block in index.html.');
    }

    vapi = window.createVapi(CFG.vapiPublicKey);

    try { vapi.on('status', (evt) => { setStatus(evt?.status || 'unknown'); }); } catch {}
    // Do not mute output—Vapi should speak as customer

    // Transcripts
    try { vapi.on('transcript', handleTranscript); } catch {}
    try {
      // Some SDKs emit transcript via generic 'message' too
      vapi.on('message', (m) => {
        if (m?.type === 'transcript' && (m?.final === true || lower(m?.transcriptType) === 'final')) {
          handleTranscript(m);
        }
      });
    } catch {}

    // Auto-summarize once on end statuses
    let summarized = false;
    try {
      vapi.on('status', (evt) => {
        const s = lower(evt?.status);
        if (!summarized && ['ended','completed','disconnected','failed','idle'].includes(s)) {
          summarized = true;
          if (convo.length) doSummarize();
        }
      });
    } catch {}

    setStatus('initializing…');
    await vapi.start(CFG.vapiAssistantId);
    listening = true;
    $('micBtn')?.classList.add('on');
    setStatus('listening');
  } catch (err) {
    console.error('Vapi start error:', err);
    setStatus('error');
    alert('Vapi failed to start. See console for details.');
  }
}

async function stopVapi() {
  try { if (vapi?.stop) await vapi.stop(); } catch (e) {}
  listening = false;
  $('micBtn')?.classList.remove('on');
  setStatus('stopped');
}

// UI buttons
$('micBtn')?.addEventListener('click', async () => {
  if (!listening) await startVapi();
  else await stopVapi();
});
$('endBtn')?.addEventListener('click', async () => {
  await stopVapi();
  await doSummarize();
});

// Manual analyze (no mic)
$('analyzeBtn')?.addEventListener('click', async () => {
  const text = $('utterance')?.value?.trim();
  if (!text) return alert('Type something');
  convo.push({ speaker: 'customer', text });
  const sj = $('summaryJson');
  if (sj) sj.value = JSON.stringify(convo, null, 2);

  try {
    const r = await fetch(API + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context: 'agentic-ai', side: 'customer' })
    });
    const j = await r.json();
    if (!j.ok) return fail('Backend error from /api/analyze');
    showAdvice(j);
  } catch {
    fail('Network error calling /api/analyze');
  }
});

// ---------- Load /api/config ----------
(async function init() {
  try {
    const r = await fetch(API + '/api/config');
    CFG = await r.json();
  } catch (e) {
    console.error('Failed to load /api/config', e);
    fail('Cannot load /api/config. Is the backend running on :4000?');
  }
})();
