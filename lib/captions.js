/**
 * Fetches and parses YouTube auto-generated captions (subtitles)
 * using yt-dlp's --write-auto-subs option, falling back to manual subs.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript';

const execAsync = promisify(exec);

/**
 * Downloads captions via yt-dlp and returns an array of timed segments.
 * Each segment: { start: number, end: number, text: string }
 */
export async function fetchCaptions(youtubeUrl, outputDir) {
  // Method 1: youtube-transcript (fastest, bypasses many rate limits)
  // Try English tracks first ('en', 'en-US', 'en-GB', etc.) to avoid defaulting to non-English tracks
  const preferredLangs = ['en', 'en-US', 'en-GB', 'en-CA', 'en-AU'];
  for (const lang of preferredLangs) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl, { lang });
      if (transcript && transcript.length > 0) {
        console.log(`Successfully fetched English captions (${lang}) via youtube-transcript API`);
        return transcript.map(t => ({
          start: t.offset / 1000,
          end: (t.offset + t.duration) / 1000,
          text: t.text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        }));
      }
    } catch (_) {
      // Continue trying next preferred English language code
    }
  }

  // If specific English codes fail, try default fetchTranscript only if it returns English
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl);
    if (transcript && transcript.length > 0) {
      const trackLang = transcript[0]?.lang;
      if (!trackLang || trackLang.startsWith('en')) {
        console.log('Successfully fetched captions via youtube-transcript API');
        return transcript.map(t => ({
          start: t.offset / 1000,
          end: (t.offset + t.duration) / 1000,
          text: t.text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        }));
      }
      console.warn(`Default transcript was in '${trackLang}', not English. Falling back to yt-dlp...`);
    }
  } catch (err) {
    console.warn(`youtube-transcript failed: ${err.message}. Falling back to yt-dlp...`);
  }

  // Method 2: yt-dlp fallback
  const safeName = 'captions_' + Date.now();
  const outputTemplate = path.join(outputDir, safeName);

  try {
    // Try auto-generated subs first (en), then manual subs
    const cmd = `yt-dlp --write-auto-subs --write-subs --sub-langs "en.*" --skip-download --sub-format vtt --convert-subs vtt -o "${outputTemplate}" "${youtubeUrl}"`;
    await execAsync(cmd, { timeout: 60000 });
  } catch (e) {
    throw new Error(`Both caption fetch methods failed. yt-dlp error: ${e.message}`);
  }

  // Find the downloaded .vtt file
  const files = fs.readdirSync(outputDir).filter(f => f.startsWith(safeName) && f.endsWith('.vtt'));
  if (files.length === 0) {
    throw new Error('No caption file found. The video may not have English captions.');
  }

  const vttContent = fs.readFileSync(path.join(outputDir, files[0]), 'utf-8');
  return parseVTT(vttContent);
}

/**
 * Parses a VTT string into timed segments.
 */
function parseVTT(vtt) {
  const lines = vtt.split('\n');
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp lines like: 00:00:01.000 --> 00:00:04.000
    if (line.includes('-->')) {
      const parts = line.split('-->');
      const start = parseTimestamp(parts[0].trim());
      const end = parseTimestamp(parts[1].trim().split(' ')[0]); // strip position tags

      let textLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        // Strip VTT tags like <c>, <00:00:00.000> etc.
        const clean = lines[i].replace(/<[^>]+>/g, '').trim();
        if (clean) textLines.push(clean);
        i++;
      }

      const text = textLines.join(' ').trim();
      if (text && end > start) {
        segments.push({ start, end, text });
      }
    } else {
      i++;
    }
  }

  // Merge overlapping/duplicate segments and deduplicate
  return mergeSegments(segments);
}

/**
 * Converts "HH:MM:SS.mmm" or "MM:SS.mmm" to seconds.
 */
function parseTimestamp(ts) {
  const parts = ts.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

/**
 * Merges segments that are very close in time to build clean paragraphs.
 * VTT auto-captions often have overlapping/duplicate entries.
 */
function mergeSegments(segments) {
  if (segments.length === 0) return [];

  const merged = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    // If this segment starts within 0.5s of current end, merge
    if (seg.start <= current.end + 0.5 && !current.text.endsWith(seg.text)) {
      current.end = Math.max(current.end, seg.end);
      // Only append if text differs from the last part
      if (!current.text.includes(seg.text)) {
        current.text += ' ' + seg.text;
      }
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Groups caption segments into larger "chunks" of roughly `chunkDuration` seconds.
 * This gives the AI meaningful blocks to analyze (not word-by-word).
 */
export function chunkCaptions(segments, chunkDuration = 60) {
  const chunks = [];
  let chunkStart = null;
  let chunkEnd = null;
  let chunkText = '';

  for (const seg of segments) {
    if (chunkStart === null) {
      chunkStart = seg.start;
      chunkEnd = seg.end;
      chunkText = seg.text;
    } else if (seg.start - chunkStart < chunkDuration) {
      chunkEnd = seg.end;
      chunkText += ' ' + seg.text;
    } else {
      chunks.push({ start: chunkStart, end: chunkEnd, text: chunkText.trim() });
      chunkStart = seg.start;
      chunkEnd = seg.end;
      chunkText = seg.text;
    }
  }

  if (chunkStart !== null) {
    chunks.push({ start: chunkStart, end: chunkEnd, text: chunkText.trim() });
  }

  return chunks;
}
