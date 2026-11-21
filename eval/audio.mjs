// Synthesises the audio eval cases with Microsoft Edge neural voices and turns them into WhatsApp-like voice
// notes (Ogg/Opus 32 kbps mono, a little silence around the speech, optional background noise). Cached by content.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { windowsHide: true })
    const err = []
    p.stderr.on('data', d => err.push(d))
    p.on('error', reject)
    p.stdin.on('error', () => {})
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err).toString().slice(-300)}`))))
    p.stdin.end(input)
  })
}

async function synthOnce(voice, text, rate) {
  const tts = new MsEdgeTTS()
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(text, rate ? { rate } : undefined)
    const chunks = []
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('edge tts timeout')), 25000)
      audioStream.on('data', c => chunks.push(c))
      audioStream.on('end', () => (clearTimeout(timer), resolve()))
      audioStream.on('error', e => (clearTimeout(timer), reject(e)))
    })
    const audio = Buffer.concat(chunks)
    if (audio.length < 2000) throw new Error('edge tts returned no audio')
    return audio
  } finally {
    tts.close()
  }
}

/** Path of the voice note for an audio case, synthesising it on first use. */
export async function ensureAudio(testCase, dir) {
  fs.mkdirSync(dir, { recursive: true })
  const key = crypto.createHash('sha1').update(JSON.stringify([testCase.voice, testCase.tts, testCase.noise || 0, testCase.rate || ''])).digest('hex').slice(0, 12)
  const file = path.join(dir, `${testCase.id}-${key}.ogg`)
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file
  let mp3 = null
  let lastError = null
  for (let attempt = 0; attempt < 8 && !mp3; attempt++) {
    try {
      mp3 = await synthOnce(testCase.voice, testCase.tts, testCase.rate)
    } catch (err) {
      lastError = err
      await new Promise(r => setTimeout(r, 1000 + attempt * 1000))
    }
  }
  if (!mp3) throw new Error(`could not synthesise ${testCase.id}: ${lastError?.message}`)
  const shape = '[0:a]adelay=350:all=1,apad=pad_dur=0.5[v]'
  const args = testCase.noise
    ? ['-y', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=${testCase.noise}:sample_rate=24000`,
        '-filter_complex', `${shape};[v][1:a]amix=inputs=2:duration=first:normalize=0[out]`, '-map', '[out]']
    : ['-y', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-filter_complex', shape, '-map', '[v]']
  await ffmpeg([...args, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000', '-application', 'voip', '-map_metadata', '-1', file], mp3)
  return file
}
