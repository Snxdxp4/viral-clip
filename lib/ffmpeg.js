/**
 * ffmpeg wrapper for trimming video clips and burning in subtitles.
 * Outputs vertical 9:16 format for TikTok/Reels/Shorts.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Trims a clip from a source video, adds subtitle overlay, and exports as 9:16.
 *
 * @param {string} sourceVideoPath - Path to the downloaded full video
 * @param {number} startTime - Start in seconds
 * @param {number} endTime - End in seconds
 * @param {string} outputPath - Full output path for the clip
 * @param {Array} captionSegments - Array of { start, end, text } for this clip's window
 * @param {string} hookText - Short hook text to show at the top
 */
function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    if (ts.includes(':')) {
      const parts = ts.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parseFloat(ts) || 0;
  }
  return 0;
}

export async function trimAndExportClip(
  sourceVideoPath,
  startTime,
  endTime,
  outputPath
) {
  const startNum = parseTimestamp(startTime);
  const endNum = parseTimestamp(endTime);
  const duration = endNum - startNum;

  if (isNaN(duration) || duration <= 0) {
    throw new Error(`Invalid timestamps: start=${startTime}, end=${endTime}`);
  }

  const cmdArgs = [
    '-y',
    '-ss', startNum.toString(),
    '-i', sourceVideoPath,
    '-t', duration.toString(),
    // Keep original aspect ratio, but scale down 4K to max 1080p to keep encoding fast
    '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    '-r', '30', // Drop to 30fps to speed up encoding significantly
    '-c:v', 'libx264',
    '-preset', 'superfast', // Faster encoding
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-shortest',
    outputPath
  ];

  try {
    await execFileAsync('ffmpeg', cmdArgs, { timeout: 300000 }); // 5 min max
    const stat = fs.statSync(outputPath);
    if (stat.size < 1024) {
      throw new Error(`Generated file is empty. The start time (${startNum}s) might be beyond the video duration.`);
    }
  } catch (err) {
    throw new Error(`ffmpeg trimming failed: ${err.message}`);
  }

  return outputPath;
}

/**
 * Returns the file size in MB for a given path.
 */
export function getFileSizeMB(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return (stat.size / 1024 / 1024).toFixed(1);
  } catch {
    return '?';
  }
}
