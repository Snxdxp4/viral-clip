/**
 * yt-dlp wrapper for downloading YouTube videos and metadata.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { readdirSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Fetches video metadata (title, duration, thumbnail) without downloading video.
 */
export async function getVideoInfo(youtubeUrl) {
  try {
    const { stdout } = await execAsync(
      `yt-dlp --dump-json --no-playlist "${youtubeUrl}"`,
      { timeout: 30000, maxBuffer: 1024 * 1024 * 20 } // 10MB buffer
    );
    const info = JSON.parse(stdout);
    return {
      id: info.id,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
      viewCount: info.view_count,
      description: info.description?.substring(0, 500),
    };
  } catch (err) {
    throw new Error(`Could not fetch video info: ${err.message}`);
  }
}

/**
 * Downloads the video in best mp4 quality to the specified output path.
 * Returns the actual output file path.
 */
export async function downloadVideo(youtubeUrl, outputDir, jobId, onProgress) {
  const outputTemplate = path.join(outputDir, `source_${jobId}.%(ext)s`);
  const finalFilePrefix = `source_${jobId}`;

  let ytDlpError = null;
  try {
    await new Promise((resolve, reject) => {
      const args = [
        '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
        '--merge-output-format', 'mp4',
        '--progress',
        '--newline',
        '--no-playlist',
        '-o', outputTemplate,
        youtubeUrl
      ];

      const proc = spawn('yt-dlp', args, { windowsHide: true });
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (onProgress) {
            if (line.startsWith('[download]')) {
              const m = line.match(/([0-9.]+%)(?:\s+of\s+(?:~\s*)?([0-9.]+[A-Za-z]+))?(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/);
              if (m) {
                const pct = m[1];
                const size = m[2] ? ` of ${m[2]}` : '';
                const spd = m[3] && !m[3].includes('Unknown') ? ` (${m[3]}` : '';
                const eta = m[4] && !m[4].includes('Unknown') ? `, ETA ${m[4]})` : (spd ? ')' : '');
                onProgress(`Downloading video: ${pct}${size}${spd}${eta}`);
              } else if (line.includes('100%')) {
                onProgress('Downloading video: 100%');
              } else if (line.includes('Destination:')) {
                const dest = path.basename(line.split('Destination:')[1]?.trim() || '');
                onProgress(`Downloading stream: ${dest}`);
              }
            } else if (line.startsWith('[Merger]')) {
              onProgress('Merging audio and video streams...');
            }
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(-300)}`));
        }
      });
    });
  } catch (err) {
    // WinError 32 workaround: yt-dlp sometimes fails to rename .temp.mp4 to .mp4 because Windows Defender locks it.
    console.warn(`yt-dlp command threw an error, checking for temp files... Error: ${err.message}`);
    ytDlpError = err;
  }

  const exactTempMp4 = `${finalFilePrefix}.temp.mp4`;
  const exactTempMkv = `${finalFilePrefix}.temp.mkv`;
  const exactTempWebm = `${finalFilePrefix}.temp.webm`;

  const files = readdirSync(outputDir);
  
  // Find any fully merged video file (ignore intermediate stream files like .f401.mp4 or .f140.m4a)
  let finalVideo = files.find(f => 
    f.startsWith(finalFilePrefix) && 
    (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')) &&
    !f.match(/\.f[0-9]+/) &&
    !f.endsWith('.part') && 
    !f.endsWith('.ytdl') &&
    !f.includes('.temp.')
  );

  const tempVideo = files.find(f => f === exactTempMp4 || f === exactTempMkv || f === exactTempWebm || (f.startsWith(finalFilePrefix) && f.includes('.temp.')));

  if (!finalVideo && tempVideo) {
    // If only the temp file exists, manually rename it
    const oldPath = path.join(outputDir, tempVideo);
    const ext = path.extname(tempVideo.replace('.temp', ''));
    const newPath = path.join(outputDir, `${finalFilePrefix}${ext}`);
    try {
      // Add a slight delay to let Windows release the lock
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { renameSync } = await import('fs');
      renameSync(oldPath, newPath);
      finalVideo = `${finalFilePrefix}${ext}`;
    } catch (renameErr) {
      throw new Error(`Failed to recover from WinError 32. Could not rename temp file: ${renameErr.message}`);
    }
  }

  if (!finalVideo) {
    throw new Error(`Downloaded video file not found. yt-dlp error: ${ytDlpError ? ytDlpError.message : 'Unknown'}`);
  }

  return path.join(outputDir, finalVideo);
}
