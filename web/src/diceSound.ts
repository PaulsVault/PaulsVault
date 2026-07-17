// Sonido de dados sintetizado con WebAudio (sin archivos externos): una tanda de "clacks"
// percusivos que simulan los dados rodando y un golpe final al asentarse. Se reproduce desde
// el <DiceOverlay/> cada vez que se presenta una tirada. Respeta el toggle diceSoundEnabled().
import { diceSoundEnabled } from "./theme";

type Profile = "fast" | "normal" | "heavy";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume(); // se desbloquea con el clic del usuario que lanza
    return ctx;
  } catch { return null; }
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(ac.sampleRate * 0.25);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

// Un golpe de dado: ruido filtrado (banda) con envolvente percusiva muy corta.
function clack(ac: AudioContext, when: number, dur: number, freq: number, vol: number): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.4;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(vol, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0008, when + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(when);
  src.stop(when + dur + 0.02);
}

/** Reproduce el sonido de los dados. El perfil ajusta cuántos golpes y cuánto duran. */
export function playDiceSound(profile: Profile = "normal"): void {
  if (!diceSoundEnabled()) return;
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  const clacks = profile === "heavy" ? 7 : profile === "fast" ? 4 : 5;
  const spread = profile === "heavy" ? 0.42 : profile === "fast" ? 0.24 : 0.32;
  for (let i = 0; i < clacks; i++) {
    // golpes cada vez más juntos y suaves, con algo de azar (efecto de dado que se frena).
    const when = t0 + (i / clacks) * spread + Math.random() * 0.03;
    const vol = 0.22 * (1 - i / (clacks + 2)) + 0.06;
    clack(ac, when, 0.045 + Math.random() * 0.04, 1100 + Math.random() * 1500, vol);
  }
  clack(ac, t0 + spread + 0.02, 0.12, 260, 0.26); // golpe final al asentarse
}
