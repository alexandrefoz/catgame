// Efeitos sonoros opcionais, sintetizados via Web Audio API (sem arquivos de áudio externos,
// mantendo o jogo 100% offline e sem dependências). Preferência de mudo persiste localmente.
import { getItem, setItem } from "./storage.js";

const MUTE_KEY = "soundMuted";
let muted = getItem(MUTE_KEY, false);
let audioCtx = null;

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  setItem(MUTE_KEY, value);
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

function ensureContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Miau curto e alegre: usado quando o jogador marca um gato sem quebrar nenhuma regra na hora.
export function playCatSuccess() {
  if (muted) return;
  const ctx = ensureContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, t0);
  osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.07);
  osc.frequency.exponentialRampToValueAtTime(600, t0 + 0.16);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.22);
}

// Miado forte e bravo: usado quando o jogador marca um gato que quebra uma regra (fim de jogo).
// Dois osciladores levemente dessintonizados dão uma textura mais "áspera"; um estouro de ruído
// no final simula o chiado/rosnado de um gato irritado.
export function playCatFail() {
  if (muted) return;
  const ctx = ensureContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  [
    { type: "sawtooth", detune: 0, peakGain: 0.32 },
    { type: "square", detune: -14, peakGain: 0.14 },
  ].forEach(({ type, detune, peakGain }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.detune.setValueAtTime(detune, t0);
    osc.frequency.setValueAtTime(760, t0);
    osc.frequency.exponentialRampToValueAtTime(1000, t0 + 0.1);
    osc.frequency.exponentialRampToValueAtTime(230, t0 + 0.6);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.7);
  });

  const noiseDuration = 0.35;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDuration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t0 + 0.28);
  noiseGain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.33);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);

  noise.connect(noiseGain).connect(ctx.destination);
  noise.start(t0 + 0.28);
  noise.stop(t0 + 0.68);
}
