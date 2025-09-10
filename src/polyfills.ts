// src/polyfills.ts
import { Buffer } from 'buffer';

// Apply Buffer polyfill globally as early as possible
window.Buffer = window.Buffer || Buffer;