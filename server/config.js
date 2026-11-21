import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })
// The Gemini SDK prefers GOOGLE_API_KEY when both exist; a machine-wide one must not override ours.
if (process.env.GEMINI_API_KEY) delete process.env.GOOGLE_API_KEY

const list = (value, fallback) => (value || fallback).split(',').map(s => s.trim()).filter(Boolean)
const int = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value != null ? Number(value) : fallback)

// HISAAB_DATA_DIR lets a second copy (tests, staging) run beside the real one without sharing its database.
const DATA = path.resolve(process.env.HISAAB_DATA_DIR || path.join(ROOT, 'data'))

export const config = {
  root: ROOT,
  dataDir: DATA,
  mediaDir: path.join(DATA, 'media'),
  waDir: path.join(DATA, 'wa'),
  distDir: path.join(ROOT, 'dist'),
  port: int(process.env.PORT, 3000),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),

  geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  // Understanding (server/brain.js, eval numbers in eval/README.md).
  // PARSE_MODELS: generateContent models, first = primary generateContent model, the rest + PARSE_FALLBACK_MODELS are
  // tried after it. With VOICE_PARSE / TEXT_PARSE = live they are the hedge behind Gemini Live, started after
  // VOICE_HEDGE_MS / PARSE_HEDGE_MS without an answer, or at once when Live fails.
  // Free tier (measured 31 Oct): 3.5-flash-lite 500/day + 15/min; the 3.x "flash" models only 20/day.
  parseModels: list(process.env.PARSE_MODELS, 'gemini-3.5-flash-lite,gemini-3.1-flash-lite'),
  // Always appended to the hedge lane, so a backup with a tiny daily quota (free tier: 20/day on the flash models)
  // can never leave a message without a second model.
  parseFallbackModels: list(process.env.PARSE_FALLBACK_MODELS, 'gemini-3.1-flash-lite,gemini-3.1-flash-lite-preview'),
  // VOICE_PARSE: 'live' = voice notes go to Gemini Live first (LIVE_PARSE_MODELS) with PARSE_MODELS as the hedge/fallback;
  // 'generate' = voice notes use PARSE_MODELS like text.
  voiceParse: process.env.VOICE_PARSE === 'generate' ? 'generate' : 'live',
  // Voice notes. Order by the 31 Oct free-tier sample (eval/README.md "Free tier"): 3.8-live first; 2.5 native audio
  // last: as accurate on the sample but ~2.5 s slower per note, with its p50 above VOICE_HEDGE_MS (it would spend a
  // generateContent request on ~60% of notes), and more "1011 Internal error" closes.
  liveParseModels: list(process.env.LIVE_PARSE_MODELS, 'gemini-3.8-live,gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-latest'),
  // Text messages (TEXT_PARSE=live): 2.5 native audio first — as accurate as 3.8-live on the sample (20/20 each) and
  // faster (p50 1.8 s vs 2.9 s), never past PARSE_HEDGE_MS. Empty = the same order as LIVE_PARSE_MODELS.
  liveTextModels: list(process.env.LIVE_TEXT_MODELS ?? 'gemini-2.5-flash-native-audio-latest,gemini-3.8-live,gemini-3.1-flash-live-preview', ''),
  // TEXT_PARSE: 'live' = text messages also go to Gemini Live first (own quota; generateContent is the hedge);
  // 'generate' = PARSE_MODELS first with Live as the hedge.
  textParse: process.env.TEXT_PARSE === 'generate' ? 'generate' : 'live',
  parseThinking: process.env.PARSE_THINKING || '', // '' = model default; minimal | low | medium | high | token budget
  parseHedgeMs: int(process.env.PARSE_HEDGE_MS, 5000),
  voiceHedgeMs: int(process.env.VOICE_HEDGE_MS, 6000),
  parseTimeoutMs: int(process.env.PARSE_TIMEOUT_MS, 25000), // one text attempt
  parseAudioTimeoutMs: int(process.env.PARSE_AUDIO_TIMEOUT_MS, 35000), // one voice/photo generateContent attempt (+0.5 s per audio second over 40 s)
  // One Live session, connect to tool call. Live needs longer for a longer note (measured: 40 s note 17 s on
  // gemini-3.8-live / 36 s on 3.1-flash-live; 70 s note 25 s / 47 s), so a voice note gets
  // 10 s + 0.75 s per second of audio, at least LIVE_PARSE_TIMEOUT_MS and at most LIVE_PARSE_MAX_TIMEOUT_MS.
  liveParseTimeoutMs: int(process.env.LIVE_PARSE_TIMEOUT_MS, 20000),
  liveParseMaxTimeoutMs: int(process.env.LIVE_PARSE_MAX_TIMEOUT_MS, 70000),
  // Live parse sessions this server holds at once, and how long a message waits for a free one before the
  // generateContent lane answers it. Free key, 31 Oct: 5 sessions open at once were all accepted (more not measured);
  // 4 for parsing leaves room for one live call (server/live.js) inside what was measured.
  liveParseConcurrency: Math.max(1, int(process.env.LIVE_PARSE_CONCURRENCY, 4)),
  liveSlotWaitMs: int(process.env.LIVE_SLOT_WAIT_MS, 8000),
  // Voice notes at least this long start the generateContent hedge at once instead of after VOICE_HEDGE_MS.
  longNoteSeconds: int(process.env.LONG_NOTE_SECONDS, 30),
  parsePatienceMs: int(process.env.PARSE_PATIENCE_MS, 90000), // then the message fails with error 'busy'
  interimAfterMs: int(process.env.INTERIM_AFTER_MS, 12000), // one "likh raha hoon" WhatsApp line after this long
  liveModel: process.env.LIVE_MODEL || 'gemini-3.8-live',
  liveVoice: process.env.LIVE_VOICE || 'Puck',

  ttsOrder: list(process.env.TTS_ORDER, 'uplift,edge,gemini'),
  upliftKey: process.env.UPLIFT_API_KEY || '',
  upliftVoice: process.env.UPLIFT_VOICE || 'v_8eelc901',
  edgeVoice: process.env.EDGE_VOICE || 'ur-PK-AsadNeural',
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
  geminiTtsVoice: process.env.GEMINI_TTS_VOICE || 'Kore',

  // Protects the shared Gemini quota: messages one shop can send per day.
  dailyMessageLimit: int(process.env.DAILY_MESSAGE_LIMIT, 300),
  // How long a WhatsApp QR stays open before the link attempt is abandoned.
  linkTimeoutMs: int(process.env.LINK_TIMEOUT_MS, 4 * 60 * 1000),
  sessionDays: int(process.env.SESSION_DAYS, 30),

  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
}

/** Base URL that a phone can open (magic login links). */
export function baseUrl() {
  if (config.publicUrl) return config.publicUrl
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) return `http://${net.address}:${config.port}`
    }
  }
  return `http://localhost:${config.port}`
}
