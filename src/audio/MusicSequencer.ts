import { clamp, mulberry32 } from '../core';
import type { MusicTrackId } from '../types';

export interface ChordEvent {
  step: number;
  notes: readonly number[];
  durSteps: number;
}

export interface TrackPattern {
  bpm: number;
  steps: number;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  padWave: OscillatorType;
  gainScale: number;
  bass: ReadonlyArray<number | null>;
  lead: ReadonlyArray<number | null>;
  chords: ReadonlyArray<ChordEvent>;
  kick: ReadonlyArray<number>;
  snare: ReadonlyArray<number>;
  hat: ReadonlyArray<number>;
}

type ActiveMusicTrackId = Exclude<MusicTrackId, 'none'>;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 32-step (2 bars of 16th notes) procedural patterns per track
export const MUSIC_PATTERNS: Record<ActiveMusicTrackId, TrackPattern> = {
  // Atmospheric heroic Fortnite-inspired lobby synth theme (108 BPM, C minor)
  lobby: {
    bpm: 108,
    steps: 32,
    bassWave: 'triangle',
    leadWave: 'sine',
    padWave: 'triangle',
    gainScale: 0.72,
    // C2 -> Ab1 -> Eb2 -> Bb1
    bass: [
      36, null, null, 36, null, null, 36, null,
      32, null, null, 32, null, null, 32, null,
      39, null, null, 39, null, null, 39, null,
      34, null, null, 34, null, null, 34, 36,
    ],
    lead: [
      72, null, 75, null, 79, null, 75, null,
      68, null, 72, null, 75, null, 79, null,
      75, null, 79, null, 82, null, 79, null,
      74, null, 77, null, 82, null, 79, null,
    ],
    chords: [
      { step: 0, notes: [48, 55, 63], durSteps: 8 },
      { step: 8, notes: [44, 51, 60], durSteps: 8 },
      { step: 16, notes: [51, 58, 67], durSteps: 8 },
      { step: 24, notes: [46, 53, 62], durSteps: 8 },
    ],
    kick: [
      1, 0, 0, 0, 0, 0, 0.6, 0,
      1, 0, 0, 0, 0, 0, 0.5, 0,
      1, 0, 0, 0, 0, 0, 0.6, 0,
      1, 0, 0, 0, 0, 0, 0.7, 0,
    ],
    snare: [
      0, 0, 0, 0, 0.5, 0, 0, 0,
      0, 0, 0, 0, 0.5, 0, 0, 0,
      0, 0, 0, 0, 0.5, 0, 0, 0,
      0, 0, 0, 0, 0.55, 0, 0.3, 0,
    ],
    hat: [
      0.4, 0, 0.3, 0, 0.4, 0, 0.3, 0.25,
      0.4, 0, 0.3, 0, 0.4, 0, 0.3, 0.25,
      0.4, 0, 0.3, 0, 0.4, 0, 0.3, 0.25,
      0.4, 0, 0.3, 0, 0.4, 0.2, 0.35, 0.25,
    ],
  },

  // Energetic Battle Bus drop hype groove (126 BPM, D minor)
  bus: {
    bpm: 126,
    steps: 32,
    bassWave: 'sawtooth',
    leadWave: 'triangle',
    padWave: 'sawtooth',
    gainScale: 0.78,
    bass: [
      38, null, 38, null, 38, null, 50, null,
      34, null, 34, null, 34, null, 46, null,
      36, null, 36, null, 36, null, 48, null,
      33, null, 33, null, 38, null, 41, null,
    ],
    lead: [
      74, null, 77, null, 81, null, 77, null,
      70, null, 74, null, 77, null, 81, null,
      72, null, 76, null, 79, null, 76, null,
      69, null, 74, null, 77, null, 81, 84,
    ],
    chords: [
      { step: 0, notes: [50, 57, 65], durSteps: 6 },
      { step: 8, notes: [46, 53, 62], durSteps: 6 },
      { step: 16, notes: [48, 55, 64], durSteps: 6 },
      { step: 24, notes: [45, 53, 61], durSteps: 6 },
    ],
    kick: [
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0.6, 0,
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 1, 0,
    ],
    snare: [
      0, 0, 0, 0, 0.85, 0, 0, 0,
      0, 0, 0, 0, 0.85, 0, 0, 0.4,
      0, 0, 0, 0, 0.85, 0, 0, 0,
      0, 0, 0, 0, 0.85, 0, 0.5, 0.4,
    ],
    hat: [
      0.5, 0.25, 0.6, 0.25, 0.5, 0.25, 0.6, 0.25,
      0.5, 0.25, 0.6, 0.25, 0.5, 0.25, 0.6, 0.3,
      0.5, 0.25, 0.6, 0.25, 0.5, 0.25, 0.6, 0.25,
      0.5, 0.25, 0.6, 0.25, 0.5, 0.35, 0.6, 0.4,
    ],
  },

  // Emote 1: Victory Groove (122 BPM funky slap bass + upbeat synth stabs)
  emote_1: {
    bpm: 122,
    steps: 32,
    bassWave: 'sawtooth',
    leadWave: 'triangle',
    padWave: 'triangle',
    gainScale: 0.88,
    bass: [
      41, null, 41, 53, null, 41, 44, null,
      46, null, 46, 58, null, 48, 46, 44,
      41, null, 41, 53, null, 41, 44, null,
      48, null, 46, null, 44, null, 43, null,
    ],
    lead: [
      77, null, 80, null, 84, null, 80, null,
      82, null, 80, 77, null, 75, 77, null,
      77, null, 80, null, 84, null, 87, null,
      84, null, 82, null, 80, null, 77, null,
    ],
    chords: [
      { step: 0, notes: [53, 60, 65], durSteps: 3 },
      { step: 6, notes: [53, 60, 65], durSteps: 2 },
      { step: 10, notes: [56, 63, 68], durSteps: 3 },
      { step: 16, notes: [53, 60, 65], durSteps: 3 },
      { step: 22, notes: [58, 65, 70], durSteps: 2 },
      { step: 26, notes: [55, 62, 67], durSteps: 4 },
    ],
    kick: [
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0.5, 0,
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0.7, 0,
    ],
    snare: [
      0, 0, 0, 0, 0.9, 0, 0, 0.3,
      0, 0, 0, 0, 0.9, 0, 0, 0,
      0, 0, 0, 0, 0.9, 0, 0, 0.3,
      0, 0, 0, 0, 0.9, 0, 0.45, 0,
    ],
    hat: [
      0.5, 0.25, 0.75, 0.25, 0.5, 0.25, 0.75, 0.25,
      0.5, 0.25, 0.75, 0.25, 0.5, 0.25, 0.75, 0.25,
      0.5, 0.25, 0.75, 0.25, 0.5, 0.25, 0.75, 0.25,
      0.5, 0.25, 0.75, 0.25, 0.5, 0.35, 0.75, 0.4,
    ],
  },

  // Emote 2: Wave Floss (128 BPM high-energy dance pluck + offbeat bass)
  emote_2: {
    bpm: 128,
    steps: 32,
    bassWave: 'sawtooth',
    leadWave: 'square',
    padWave: 'sine',
    gainScale: 0.84,
    bass: [
      null, null, 45, null, null, null, 45, null,
      null, null, 41, null, null, null, 41, null,
      null, null, 48, null, null, null, 48, null,
      null, null, 43, null, null, null, 43, null,
    ],
    lead: [
      81, 79, 76, null, 81, 79, 76, null,
      77, 76, 72, null, 77, 76, 72, null,
      84, 83, 79, null, 84, 83, 79, null,
      79, 77, 74, null, 81, 79, 76, null,
    ],
    chords: [
      { step: 0, notes: [57, 64, 69], durSteps: 4 },
      { step: 8, notes: [53, 60, 65], durSteps: 4 },
      { step: 16, notes: [60, 67, 72], durSteps: 4 },
      { step: 24, notes: [55, 62, 67], durSteps: 4 },
    ],
    kick: [
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 1, 0,
    ],
    snare: [
      0, 0, 0, 0, 0.9, 0, 0, 0,
      0, 0, 0, 0, 0.9, 0, 0, 0,
      0, 0, 0, 0, 0.9, 0, 0, 0,
      0, 0, 0, 0, 0.9, 0, 0.5, 0.5,
    ],
    hat: [
      0.3, 0, 0.8, 0, 0.3, 0, 0.8, 0,
      0.3, 0, 0.8, 0, 0.3, 0, 0.8, 0,
      0.3, 0, 0.8, 0, 0.3, 0, 0.8, 0,
      0.3, 0, 0.8, 0, 0.3, 0, 0.8, 0.4,
    ],
  },

  // Emote 3: Take The W (132 BPM cheeky electro-swing / bouncy brass hop)
  emote_3: {
    bpm: 132,
    steps: 32,
    bassWave: 'triangle',
    leadWave: 'sawtooth',
    padWave: 'triangle',
    gainScale: 0.86,
    bass: [
      38, null, 45, null, 38, null, 44, null,
      43, null, 38, null, 41, null, 40, null,
      38, null, 45, null, 38, null, 46, null,
      45, null, 43, null, 41, null, 40, null,
    ],
    lead: [
      74, null, 77, null, 81, null, 80, null,
      79, null, 77, null, 74, null, 72, null,
      74, null, 77, null, 81, null, 82, null,
      81, null, 79, null, 77, null, 76, null,
    ],
    chords: [
      { step: 2, notes: [50, 57, 62], durSteps: 2 },
      { step: 6, notes: [50, 57, 62], durSteps: 2 },
      { step: 10, notes: [48, 55, 60], durSteps: 2 },
      { step: 14, notes: [49, 57, 61], durSteps: 2 },
      { step: 18, notes: [50, 57, 62], durSteps: 2 },
      { step: 22, notes: [52, 58, 64], durSteps: 2 },
      { step: 26, notes: [49, 55, 61], durSteps: 2 },
      { step: 30, notes: [49, 57, 61], durSteps: 2 },
    ],
    kick: [
      1, 0, 0, 0, 0.7, 0, 0, 0,
      1, 0, 0, 0, 0.7, 0, 0, 0,
      1, 0, 0, 0, 0.7, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0.6, 0,
    ],
    snare: [
      0, 0, 0.5, 0, 0.9, 0, 0.4, 0,
      0, 0, 0.5, 0, 0.9, 0, 0.4, 0,
      0, 0, 0.5, 0, 0.9, 0, 0.4, 0,
      0, 0, 0.5, 0, 0.9, 0, 0.6, 0.4,
    ],
    hat: [
      0.6, 0, 0.4, 0.3, 0.6, 0, 0.4, 0.3,
      0.6, 0, 0.4, 0.3, 0.6, 0, 0.4, 0.3,
      0.6, 0, 0.4, 0.3, 0.6, 0, 0.4, 0.3,
      0.6, 0, 0.4, 0.3, 0.6, 0.3, 0.6, 0.3,
    ],
  },

  // Emote 4: Cyber Boogie (118 BPM retro electro-funk square arp)
  emote_4: {
    bpm: 118,
    steps: 32,
    bassWave: 'square',
    leadWave: 'square',
    padWave: 'triangle',
    gainScale: 0.82,
    bass: [
      40, null, 40, 52, null, null, 40, null,
      43, null, 45, null, 47, null, 43, null,
      40, null, 40, 52, null, null, 40, null,
      48, null, 47, null, 45, null, 43, null,
    ],
    lead: [
      76, 79, 83, 79, 76, null, 83, null,
      79, 83, 86, 83, 79, null, 76, null,
      76, 79, 83, 88, 83, null, 79, null,
      84, 83, 79, 76, 74, null, 76, null,
    ],
    chords: [
      { step: 0, notes: [52, 59, 64], durSteps: 4 },
      { step: 8, notes: [55, 62, 67], durSteps: 4 },
      { step: 16, notes: [52, 59, 64], durSteps: 4 },
      { step: 24, notes: [57, 64, 69], durSteps: 4 },
    ],
    kick: [
      1, 0, 0, 0, 0, 0, 0.8, 0,
      1, 0, 0, 0, 0, 0, 0.6, 0,
      1, 0, 0, 0, 0, 0, 0.8, 0,
      1, 0, 0.6, 0, 0, 0, 0.7, 0,
    ],
    snare: [
      0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0.4, 0,
      0, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0.5, 0.3,
    ],
    hat: [
      0.5, 0.4, 0.5, 0.4, 0.5, 0.4, 0.5, 0.4,
      0.5, 0.4, 0.5, 0.4, 0.5, 0.4, 0.5, 0.4,
      0.5, 0.4, 0.5, 0.4, 0.5, 0.4, 0.5, 0.4,
      0.5, 0.4, 0.5, 0.4, 0.5, 0.4, 0.7, 0.5,
    ],
  },

  // Victory Royale celebratory synth anthem (120 BPM, C major)
  victory: {
    bpm: 120,
    steps: 32,
    bassWave: 'triangle',
    leadWave: 'sawtooth',
    padWave: 'triangle',
    gainScale: 0.84,
    bass: [
      36, null, 48, null, 36, null, 48, null,
      43, null, 55, null, 43, null, 55, null,
      45, null, 57, null, 45, null, 57, null,
      41, null, 53, null, 43, null, 55, null,
    ],
    lead: [
      72, null, 76, null, 79, null, 84, null,
      83, null, 79, null, 74, null, 79, null,
      81, null, 76, null, 72, null, 76, null,
      77, null, 81, null, 83, null, 86, null,
    ],
    chords: [
      { step: 0, notes: [48, 55, 64], durSteps: 8 },
      { step: 8, notes: [55, 62, 71], durSteps: 8 },
      { step: 16, notes: [57, 64, 72], durSteps: 8 },
      { step: 24, notes: [53, 60, 69], durSteps: 8 },
    ],
    kick: [
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0.8, 0,
    ],
    snare: [
      0, 0, 0, 0, 0.85, 0, 0, 0,
      0, 0, 0, 0, 0.85, 0, 0, 0.4,
      0, 0, 0, 0, 0.85, 0, 0, 0,
      0, 0, 0, 0, 0.85, 0.4, 0.6, 0.5,
    ],
    hat: [
      0.5, 0.25, 0.65, 0.25, 0.5, 0.25, 0.65, 0.25,
      0.5, 0.25, 0.65, 0.25, 0.5, 0.25, 0.65, 0.25,
      0.5, 0.25, 0.65, 0.25, 0.5, 0.25, 0.65, 0.25,
      0.5, 0.25, 0.65, 0.25, 0.5, 0.35, 0.7, 0.45,
    ],
  },

  // Emote 5: Electro Shuffle (126 BPM bouncy F#m electro-house groove)
  emote_5: {
    bpm: 126,
    steps: 32,
    bassWave: 'sawtooth',
    leadWave: 'square',
    padWave: 'triangle',
    gainScale: 0.84,
    bass: [
      42, null, 42, 54, null, 42, 45, null,
      38, null, 38, 50, null, 40, 44, null,
      42, null, 42, 54, null, 42, 45, null,
      40, null, 40, 52, 37, null, 49, 40,
    ],
    lead: [
      78, null, 81, 85, null, 81, 78, 81,
      74, null, 78, 81, null, 83, 81, 78,
      78, null, 81, 85, null, 88, 85, 81,
      83, null, 81, 78, 76, null, 73, 76,
    ],
    chords: [
      { step: 0, notes: [54, 57, 61], durSteps: 3 },
      { step: 6, notes: [54, 57, 61], durSteps: 2 },
      { step: 8, notes: [50, 54, 57], durSteps: 3 },
      { step: 14, notes: [52, 56, 59], durSteps: 2 },
      { step: 16, notes: [54, 57, 61], durSteps: 3 },
      { step: 22, notes: [50, 54, 57], durSteps: 2 },
      { step: 24, notes: [52, 56, 59], durSteps: 4 },
      { step: 28, notes: [49, 53, 56], durSteps: 4 },
    ],
    kick: [
      1, 0, 0, 0, 1, 0, 0, 0.45,
      1, 0, 0, 0, 1, 0, 0.55, 0,
      1, 0, 0, 0, 1, 0, 0, 0.45,
      1, 0, 0, 0, 1, 0, 0.85, 0,
    ],
    snare: [
      0, 0, 0, 0, 0.9, 0, 0, 0,
      0, 0, 0, 0, 0.9, 0, 0.35, 0.3,
      0, 0, 0, 0, 0.9, 0, 0, 0,
      0, 0, 0, 0, 0.9, 0.35, 0.6, 0.45,
    ],
    hat: [
      0.35, 0.2, 0.85, 0.25, 0.35, 0.2, 0.85, 0.3,
      0.35, 0.2, 0.85, 0.25, 0.35, 0.25, 0.85, 0.35,
      0.35, 0.2, 0.85, 0.25, 0.35, 0.2, 0.85, 0.3,
      0.35, 0.25, 0.85, 0.3, 0.4, 0.35, 0.9, 0.5,
    ],
  },

  // Emote 6: Royal Fanfare Salute (112 BPM majestic Bb major ceremonial brass anthem)
  emote_6: {
    bpm: 112,
    steps: 32,
    bassWave: 'triangle',
    leadWave: 'sawtooth',
    padWave: 'triangle',
    gainScale: 0.85,
    bass: [
      34, null, 34, null, 46, null, 34, null,
      41, null, 41, null, 43, null, 43, null,
      39, null, 39, null, 34, null, 46, null,
      41, null, 41, 45, 46, null, 34, null,
    ],
    lead: [
      70, null, 70, 74, 77, null, 82, null,
      81, null, 79, 77, 74, null, 79, null,
      75, null, 79, 82, 86, null, 82, null,
      81, null, 77, 79, 82, null, 82, null,
    ],
    chords: [
      { step: 0, notes: [58, 62, 65], durSteps: 6 },
      { step: 8, notes: [53, 57, 60], durSteps: 4 },
      { step: 12, notes: [55, 58, 62], durSteps: 4 },
      { step: 16, notes: [51, 55, 58], durSteps: 4 },
      { step: 20, notes: [58, 62, 65], durSteps: 4 },
      { step: 24, notes: [53, 57, 60], durSteps: 4 },
      { step: 28, notes: [58, 62, 65], durSteps: 4 },
    ],
    kick: [
      1, 0, 0, 0.5, 0.85, 0, 0, 0,
      1, 0, 0, 0, 0.85, 0, 0.5, 0,
      1, 0, 0, 0.5, 0.85, 0, 0, 0,
      1, 0, 0.5, 0, 1, 0, 0.75, 0,
    ],
    snare: [
      0, 0, 0.35, 0, 0.9, 0, 0, 0.35,
      0, 0, 0.35, 0, 0.9, 0, 0.4, 0.35,
      0, 0, 0.35, 0, 0.9, 0, 0, 0.35,
      0, 0, 0.45, 0, 0.95, 0.45, 0.65, 0.8,
    ],
    hat: [
      0.55, 0, 0.4, 0.25, 0.55, 0, 0.4, 0.25,
      0.55, 0, 0.4, 0.25, 0.55, 0.25, 0.5, 0.3,
      0.55, 0, 0.4, 0.25, 0.55, 0, 0.4, 0.25,
      0.55, 0.2, 0.5, 0.3, 0.65, 0.35, 0.65, 0.45,
    ],
  },

  // Endgame Combat Intense (138 BPM driving E minor / Phrygian tension groove)
  combat_intense: {
    bpm: 138,
    steps: 32,
    bassWave: 'sawtooth',
    leadWave: 'square',
    padWave: 'sawtooth',
    gainScale: 0.74,
    bass: [
      40, 40, 52, 40, 40, 40, 52, 40,
      36, 36, 48, 36, 38, 38, 50, 38,
      40, 40, 52, 40, 43, 43, 55, 43,
      41, 41, 53, 41, 35, 35, 47, 39,
    ],
    lead: [
      76, null, 79, null, 83, null, 79, 76,
      72, null, 76, null, 79, null, 77, 76,
      76, null, 79, null, 83, null, 86, 83,
      84, null, 83, 81, 79, null, 77, 75,
    ],
    chords: [
      { step: 0, notes: [52, 55, 59], durSteps: 4 },
      { step: 4, notes: [52, 55, 59], durSteps: 4 },
      { step: 8, notes: [48, 52, 55], durSteps: 4 },
      { step: 12, notes: [48, 53, 57], durSteps: 4 },
      { step: 16, notes: [52, 55, 59], durSteps: 4 },
      { step: 20, notes: [55, 59, 62], durSteps: 4 },
      { step: 24, notes: [53, 57, 60], durSteps: 4 },
      { step: 28, notes: [51, 54, 59], durSteps: 4 },
    ],
    kick: [
      1, 0, 0, 0.55, 1, 0, 0, 0,
      1, 0, 0.65, 0, 1, 0, 0.7, 0.4,
      1, 0, 0, 0.55, 1, 0, 0, 0,
      1, 0, 0.65, 0, 1, 0.55, 1, 0.6,
    ],
    snare: [
      0, 0, 0, 0, 0.95, 0, 0, 0.25,
      0, 0, 0, 0, 0.95, 0, 0.4, 0,
      0, 0, 0, 0, 0.95, 0, 0, 0.25,
      0, 0, 0.35, 0, 0.95, 0.45, 0.75, 0.6,
    ],
    hat: [
      0.65, 0.35, 0.8, 0.35, 0.65, 0.35, 0.8, 0.35,
      0.65, 0.35, 0.8, 0.35, 0.65, 0.4, 0.85, 0.45,
      0.65, 0.35, 0.8, 0.35, 0.65, 0.35, 0.8, 0.35,
      0.65, 0.4, 0.85, 0.45, 0.7, 0.5, 0.9, 0.6,
    ],
  },
};

/**
 * Lookahead Web Audio pattern sequencer supporting lobby, battle bus,
 * all 6 emote dances, combat_intense, and victory music loops.
 */
export class MusicSequencer {
  private ctx: AudioContext | null = null;
  private destination: AudioNode | null = null;
  private internalGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private currentTrack: MusicTrackId = 'none';
  private timerId: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private disposed = false;
  private readonly rand = mulberry32(0x11051c);

  constructor(ctx: AudioContext | null = null, destination: AudioNode | null = null) {
    if (ctx && destination) {
      this.attachContext(ctx, destination);
    }
  }

  /**
   * Binds an AudioContext & output bus lazily after user gesture unlock.
   */
  attachContext(ctx: AudioContext, destination: AudioNode): void {
    if (this.disposed) return;
    this.ctx = ctx;
    this.destination = destination;

    this.internalGain = ctx.createGain();
    this.internalGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.internalGain.connect(destination);

    this.noiseBuffer = this.buildNoiseBuffer(ctx);

    if (this.currentTrack !== 'none') {
      this.startLoop();
    }
  }

  setTrack(track: MusicTrackId): void {
    if (this.disposed) return;
    if (track === this.currentTrack) return;

    this.currentTrack = track;

    if (track === 'none') {
      this.stopLoop();
      return;
    }

    if (this.ctx && this.internalGain) {
      // Create a fresh track gain crossfade so previous tail fades cleanly without clicking
      this.resetInternalBus();
      this.startLoop();
    }
  }

  getCurrentTrack(): MusicTrackId {
    return this.currentTrack;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentTrack = 'none';
    this.stopLoop();
    try {
      this.internalGain?.disconnect();
    } catch {
      // ignore teardown errors
    }
    this.internalGain = null;
    this.ctx = null;
    this.destination = null;
    this.noiseBuffer = null;
  }

  private resetInternalBus(): void {
    if (!this.ctx || !this.destination) return;
    const now = this.ctx.currentTime;
    if (this.internalGain) {
      const oldGain = this.internalGain;
      try {
        oldGain.gain.cancelScheduledValues?.(now);
        oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value || 1.0), now);
        oldGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      } catch {
        // ignore if AudioContext is closed
      }
    }
    const freshGain = this.ctx.createGain();
    freshGain.gain.setValueAtTime(0.0001, now);
    freshGain.gain.linearRampToValueAtTime(1.0, now + 0.06);
    freshGain.connect(this.destination);
    this.internalGain = freshGain;
  }

  private startLoop(): void {
    this.stopTimerOnly();
    if (!this.ctx || this.currentTrack === 'none' || this.disposed) return;

    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.03;

    // Schedule initial step immediately and poll every 25ms for tight lookahead timing
    this.schedulerTick();
    this.timerId = setInterval(() => {
      this.schedulerTick();
    }, 25);
  }

  private stopLoop(): void {
    this.stopTimerOnly();
    if (this.ctx && this.internalGain) {
      const now = this.ctx.currentTime;
      try {
        this.internalGain.gain.cancelScheduledValues?.(now);
        this.internalGain.gain.setValueAtTime(
          Math.max(0.0001, this.internalGain.gain.value || 1.0),
          now,
        );
        this.internalGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      } catch {
        // ignore closed context
      }
    }
  }

  private stopTimerOnly(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private schedulerTick(): void {
    if (this.disposed || !this.ctx || !this.internalGain || this.currentTrack === 'none') {
      return;
    }

    if (this.ctx.state === 'suspended' || this.ctx.state === 'closed') {
      this.nextNoteTime = this.ctx.currentTime + 0.03;
      return;
    }

    const pattern = MUSIC_PATTERNS[this.currentTrack];
    const stepDur = 60 / pattern.bpm / 4; // 16th note duration in seconds
    const lookahead = 0.14;

    // Guard against long tab background stalls queueing dozens of notes
    if (this.nextNoteTime < this.ctx.currentTime - 0.5) {
      this.nextNoteTime = this.ctx.currentTime + 0.02;
    }

    let safety = 0;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead && safety < 16) {
      this.scheduleStep(pattern, this.currentStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % pattern.steps;
      safety++;
    }
  }

  private scheduleStep(
    pattern: TrackPattern,
    step: number,
    time: number,
    stepDur: number,
  ): void {
    if (!this.ctx || !this.internalGain) return;
    const dest = this.internalGain;
    const scale = pattern.gainScale;

    const bassMidi = pattern.bass[step];
    if (bassMidi !== null && bassMidi !== undefined) {
      this.playSynthNote(dest, time, midiToFreq(bassMidi), stepDur * 1.45, 0.14 * scale, pattern.bassWave, 540);
    }

    const leadMidi = pattern.lead[step];
    if (leadMidi !== null && leadMidi !== undefined) {
      this.playSynthNote(dest, time, midiToFreq(leadMidi), stepDur * 1.35, 0.085 * scale, pattern.leadWave, 2600);
    }

    for (const chord of pattern.chords) {
      if (chord.step === step) {
        const chordDur = stepDur * chord.durSteps;
        const perNoteGain = (0.095 * scale) / Math.max(1, chord.notes.length);
        for (const midi of chord.notes) {
          this.playSynthNote(dest, time, midiToFreq(midi), chordDur, perNoteGain, pattern.padWave, 1500);
        }
      }
    }

    const kickVel = pattern.kick[step] ?? 0;
    if (kickVel > 0) {
      this.playKick(dest, time, 0.24 * kickVel * scale);
    }

    const snareVel = pattern.snare[step] ?? 0;
    if (snareVel > 0) {
      this.playSnare(dest, time, 0.15 * snareVel * scale);
    }

    const hatVel = pattern.hat[step] ?? 0;
    if (hatVel > 0) {
      this.playHat(dest, time, 0.065 * hatVel * scale);
    }
  }

  private playSynthNote(
    target: AudioNode,
    time: number,
    freq: number,
    duration: number,
    gain: number,
    wave: OscillatorType,
    cutoffHz: number,
  ): void {
    if (!this.ctx) return;
    const dur = Math.max(0.03, duration);
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(20, freq), time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), time + Math.min(0.015, dur * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    if (typeof this.ctx.createBiquadFilter === 'function') {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoffHz, time);
      osc.connect(filter);
      filter.connect(env);
    } else {
      osc.connect(env);
    }

    env.connect(target);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playKick(target: AudioNode, time: number, gain: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.11);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0002, gain), time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    osc.connect(env);
    env.connect(target);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  private playSnare(target: AudioNode, time: number, gain: number): void {
    if (!this.ctx) return;
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(195, time);
    body.frequency.exponentialRampToValueAtTime(110, time + 0.06);

    const bodyEnv = this.ctx.createGain();
    bodyEnv.gain.setValueAtTime(Math.max(0.0002, gain * 0.7), time);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    body.connect(bodyEnv);
    bodyEnv.connect(target);
    body.start(time);
    body.stop(time + 0.09);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(Math.max(0.0002, gain), time);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);

      if (typeof this.ctx.createBiquadFilter === 'function') {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1350, time);
        src.connect(hp);
        hp.connect(env);
      } else {
        src.connect(env);
      }
      env.connect(target);
      src.start(time, 0, 0.12);
    }
  }

  private playHat(target: AudioNode, time: number, gain: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0002, gain), time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);

    if (typeof this.ctx.createBiquadFilter === 'function') {
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(5200, time);
      src.connect(hp);
      hp.connect(env);
    } else {
      src.connect(env);
    }
    env.connect(target);
    src.start(time, 0.05, 0.045);
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (typeof ctx.createBuffer !== 'function') return null;
    try {
      const rate = ctx.sampleRate || 44100;
      const len = Math.max(256, Math.floor(rate * 0.5));
      const buf = ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = clamp(this.rand() * 2 - 1, -1, 1);
      }
      return buf;
    } catch {
      return null;
    }
  }
}
