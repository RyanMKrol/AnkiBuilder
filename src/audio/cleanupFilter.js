// Background-noise cleanup for TTS clips, as ffmpeg filter chains.
//
// ElevenLabs clips carry low-frequency rumble under the voice. Measured on this project's own decks,
// the noise floor in a clip's silence sits around -37 to -51 dBFS (clean audio is below -70), and
// ~94% of that energy is BELOW 80 Hz — it reads as a low whoosh rather than a hiss. Speech has nothing
// down there (a Japanese TTS voice's fundamental is comfortably above 100 Hz), so a steep low-cut
// removes it without touching anything you want to hear.
//
// `asubcut` is a high-order Butterworth low-cut, far steeper than `highpass`: at the same corner
// frequency a 20th-order cut attenuates 50 Hz by ~60 dB where two cascaded 2-pole highpasses manage
// ~24 dB. That difference is what takes the residue from audible to gone.
//
// Chosen by ear against measurements over 14 clips spanning every deck. Averages, versus untreated:
//
//   chain       noise      voice peak   worst voice   speed
//   standard    -35.0 dB   -0.94 dB     -3.20 dB      ~48 ms
//   gentle      -21.1 dB   -0.19 dB     -2.90 dB      ~50 ms
//   aggressive  -29.1 dB   -0.69 dB     -5.70 dB      ~51 ms
//
// `aggressive` is NOT the strongest cleaner despite the name — it cleans less than `standard` and
// costs far more voice, because its 130 Hz corner cuts into the fundamental of lower-pitched clips.
// It's kept because on the rare clip whose noise reaches higher up the spectrum it does better, and a
// reviewer needs somewhere to go when the default disappoints. `gentle` is the other escape hatch:
// least cleaning, but the least chance of touching the voice.

// A cutoff must clear the voice's fundamental. 110 Hz is safe for the Japanese voices this project
// ships; a deeper voice in another language may need it lowered, which is what the env override and
// the per-card chain picker are for.
export const CLEANUP_CHAINS = {
  // The default. Steep low-cut, FFT denoise with noise tracking, then a downward expander that pushes
  // anything already below -45 dB further down — speech never goes near that level, the residual
  // noise floor lives there.
  standard:
    "asubcut=cutoff=110:order=20," +
    "afftdn=nr=12:nf=-50:tn=1," +
    "compand=attacks=0.02:decays=0.2:points=-90/-120|-55/-90|-45/-48|0/0",
  // A plain 24 dB/octave highpass and a light denoise. Leaves noticeably more rumble, but it is the
  // least invasive thing that still helps — for a clip where the default thins the voice.
  gentle: "highpass=f=100:poles=2,highpass=f=100:poles=2,afftdn=nr=12:nf=-50:tn=1",
  // Higher corner and a harder denoise, for a clip whose noise the default doesn't reach.
  aggressive: "asubcut=cutoff=130:order=20,afftdn=nr=20:nf=-50:tn=1",
};

export const DEFAULT_CLEANUP = "standard";

/**
 * Resolve a cleanup chain name to its ffmpeg `-af` fragment, or null for "don't clean".
 *
 * `null`/undefined means "use the configured default" — which is `ANKI_BUILDER_AUDIO_CLEANUP` when
 * set, otherwise `standard`. Setting that env var to `off` (or `0`/`false`) disables cleanup
 * everywhere, the same escape hatch `ANKI_BUILDER_TRIM_AUDIO=0` gives for the trim.
 *
 * An unrecognized name resolves to the default rather than throwing: cleanup is a nicety layered onto
 * the audio build, and a typo in an env var should not be able to stop a deck being made.
 */
export function cleanupChain(name = null, env = process.env) {
  const requested = name ?? env.ANKI_BUILDER_AUDIO_CLEANUP ?? DEFAULT_CLEANUP;
  const key = String(requested).toLowerCase();
  if (key === "off" || key === "0" || key === "false" || key === "none") return null;
  return CLEANUP_CHAINS[key] ?? CLEANUP_CHAINS[DEFAULT_CLEANUP];
}

/**
 * The NAME of the chain `cleanupChain` would resolve to — `"off"` when cleaning is disabled.
 *
 * `cleanupChain` returns the filter string, which is what ffmpeg needs but useless for recording on a
 * card or lighting up the right button in the modal. This is the same resolution, reported by name.
 */
export function resolveCleanupName(name = null, env = process.env) {
  const requested = name ?? env.ANKI_BUILDER_AUDIO_CLEANUP ?? DEFAULT_CLEANUP;
  const key = String(requested).toLowerCase();
  if (cleanupChain(key, env) === null) return "off";
  return Object.hasOwn(CLEANUP_CHAINS, key) ? key : DEFAULT_CLEANUP;
}

/** The chain names a reviewer can pick between in the dashboard. */
export function cleanupNames() {
  return Object.keys(CLEANUP_CHAINS);
}

/**
 * Is this a name we know? Used to validate what arrives over HTTP before it reaches an ffmpeg
 * command line — the chains are only ever selected BY name, never supplied as a filter string, so a
 * request can't inject arbitrary ffmpeg filters.
 */
export function isCleanupName(name) {
  return typeof name === "string" && Object.hasOwn(CLEANUP_CHAINS, name.toLowerCase());
}
