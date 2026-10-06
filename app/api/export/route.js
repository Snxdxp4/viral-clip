/**
 * POST /api/export
 *
 * Downloads the video and trims specified clips with subtitle overlays.
 * Uses Server-Sent Events to stream progress back to the client.
 *
 * Body: { jobId: string, clipNumbers: number[] }
 * Returns: SSE stream with progress events, then final clip URLs.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { downloadVideo } from '@/lib/ytdlp';
import { trimAndExportClip, getFileSizeMB } from '@/lib/ffmpeg';

const JOBS_DIR = path.join(process.cwd(), 'jobs');

export async function POST(request) {
  const body = await request.json();
  const { jobId, clipNumbers } = body;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const jobDir = path.join(JOBS_DIR, jobId);
  const jobFile = path.join(jobDir, 'job.json');

  if (!fs.existsSync(jobFile)) {
    return NextResponse.json({ error: 'Job not found. Please re-analyze.' }, { status: 404 });
  }

  const job = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
  const selectedClips = clipNumbers?.length
    ? job.clips.filter(c => clipNumbers.includes(c.clipNumber))
    : job.clips;

  // Use SSE for real-time progress streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 1: Download video if not already done
        let sourceVideoPath = null;
        const prefix = `source_${jobId}`;
        
        const files = fs.readdirSync(jobDir);
        let validFiles = files.filter(f => 
          f.startsWith(prefix) && 
          (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')) &&
          !f.match(/\.f[0-9]+/) &&
          !f.endsWith('.part') && 
          !f.endsWith('.ytdl') &&
          !f.includes('.temp.')
        );
        let existingVideo = validFiles.find(f => f.endsWith('.mp4')) || validFiles[0];

        if (existingVideo) {
          sourceVideoPath = path.join(jobDir, existingVideo);
          send('progress', { step: 'download', status: 'cached', message: 'Using cached video...' });
        } else {
          send('progress', { step: 'download', status: 'started', message: 'Downloading video (this may take a few minutes)...' });
          try {
            let lastSendTime = 0;
            sourceVideoPath = await downloadVideo(job.url, jobDir, jobId, (progressMsg) => {
              const now = Date.now();
              // Throttle progress events to max once every 300ms, or when 100% / merging
              if (now - lastSendTime > 300 || progressMsg.includes('100%') || progressMsg.includes('Merging')) {
                lastSendTime = now;
                send('progress', {
                  step: 'download',
                  status: 'downloading',
                  message: progressMsg
                });
              }
            });
            send('progress', { step: 'download', status: 'done', message: 'Video downloaded successfully.' });
          } catch (err) {
            send('error', { message: 'Download failed: ' + err.message });
            controller.close();
            return;
          }
        }

        // Step 2: Trim each selected clip
        const exportedClips = [];
        for (let i = 0; i < selectedClips.length; i++) {
          const clip = selectedClips[i];
          send('progress', {
            step: 'trim',
            status: 'started',
            clipNumber: clip.clipNumber,
            message: `Exporting clip ${i + 1}/${selectedClips.length}: "${clip.suggestedTitle}"...`,
          });

          // Sanitize the title for file system (remove invalid characters and spaces)
          const safeTitle = (clip.suggestedTitle || `clip_${clip.clipNumber}`)
            .replace(/[<>:"/\\|?*]+/g, '')
            .trim()
            .replace(/\s+/g, '_');
            
          const clipFilename = `${safeTitle}.mp4`;
          const clipPath = path.join(jobDir, clipFilename);

          try {
            await trimAndExportClip(
              sourceVideoPath,
              clip.startTime,
              clip.endTime,
              clipPath
            );

            const sizeMB = getFileSizeMB(clipPath);
            exportedClips.push({
              clipNumber: clip.clipNumber,
              title: clip.suggestedTitle,
              score: clip.scoreBreakdown.total,
              downloadUrl: `/api/clips/${jobId}/${encodeURIComponent(clipFilename)}`,
              sizeMB,
            });

            send('progress', {
              step: 'trim',
              status: 'done',
              clipNumber: clip.clipNumber,
              message: `Clip ${i + 1} exported (${sizeMB} MB)`,
            });
          } catch (err) {
            send('progress', {
              step: 'trim',
              status: 'error',
              clipNumber: clip.clipNumber,
              message: `Failed to export clip ${clip.clipNumber}: ${err.message}`,
            });
          }
        }

        // Step 3: Done
        send('done', { exportedClips });
        controller.close();
      } catch (err) {
        send('error', { message: 'Unexpected error: ' + err.message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
