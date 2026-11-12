import { fileURLToPath } from 'node:url';
import path from 'node:path';

// core/ and server/ live outside src/, so the bundler root is the repo root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('next').NextConfig} */
export default {
  turbopack: { root },
  serverExternalPackages: ['near-api-js'],
  poweredByHeader: false,
};
