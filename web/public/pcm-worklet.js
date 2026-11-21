// Collects mic samples (the AudioContext runs at 16 kHz) and posts ~50 ms Float32 chunks.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(800)
    this.len = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.len++] = ch[i]
        if (this.len === this.buf.length) {
          this.port.postMessage(this.buf.slice(0))
          this.len = 0
        }
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
