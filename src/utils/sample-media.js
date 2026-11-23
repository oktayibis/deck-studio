import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execWithoutShell } from './security.js';

export const SAMPLE_MEDIA_DIR = path.join(process.cwd(), 'fixtures/media');

export async function ensureSampleMediaAssets() {
  fs.mkdirSync(SAMPLE_MEDIA_DIR, { recursive: true });

  // 1. Screenshot 1: Grafana / Telemetry Spike at 14:02 UTC
  const shot1Path = path.join(SAMPLE_MEDIA_DIR, 'march-incident-telemetry-spike.svg');
  const shot1Svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 600" width="1100" height="600">
    <rect width="1100" height="600" fill="#0F172A"/>
    <rect x="24" y="24" width="1052" height="552" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>
    <rect x="48" y="48" width="380" height="28" rx="4" fill="#B83214"/>
    <text x="62" y="67" font-family="JetBrains Mono, monospace" font-weight="700" font-size="14" fill="#FFFFFF">EU-CENTRAL-1 · MARCH 12 INCIDENT TELEMETRY</text>
    <text x="1040" y="67" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">14:02 UTC — 14:16 UTC</text>
    <line x1="48" y1="96" x2="1052" y2="96" stroke="#334155" stroke-width="2"/>
    <rect x="48" y="120" width="310" height="145" rx="6" fill="#0F172A" stroke="#475569"/>
    <text x="68" y="154" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">CONNECTION POOL SATURATION</text>
    <text x="68" y="218" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="48" fill="#B83214">94%</text>
    <text x="68" y="246" font-family="JetBrains Mono, monospace" font-size="13" fill="#CBD5E1">Threshold: 85% (500 max conns)</text>
    <rect x="384" y="120" width="310" height="145" rx="6" fill="#0F172A" stroke="#475569"/>
    <text x="404" y="154" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">PEAK P99 LATENCY</text>
    <text x="404" y="218" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="48" fill="#F8FAFC">412 ms</text>
    <text x="404" y="246" font-family="JetBrains Mono, monospace" font-size="13" fill="#CBD5E1">Nominal baseline: 38 ms</text>
    <rect x="720" y="120" width="332" height="145" rx="6" fill="#0F172A" stroke="#475569"/>
    <text x="740" y="154" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">MITIGATION WINDOW</text>
    <text x="740" y="218" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="48" fill="#0F766E">14 min</text>
    <text x="740" y="246" font-family="JetBrains Mono, monospace" font-size="13" fill="#CBD5E1">14:02 UTC → 14:16 UTC</text>
    <rect x="48" y="290" width="1004" height="256" rx="6" fill="#0F172A" stroke="#334155"/>
    <polyline points="72,500 180,498 290,495 390,335 480,320 580,350 690,430 810,494 920,496 1020,495" fill="none" stroke="#B83214" stroke-width="5"/>
    <circle cx="480" cy="320" r="7" fill="#FFFFFF" stroke="#B83214" stroke-width="3"/>
    <text x="495" y="315" font-family="JetBrains Mono, monospace" font-size="13" fill="#F8FAFC">14:06 UTC · 412 ms peak (94% pool)</text>
  </svg>`;
  fs.writeFileSync(shot1Path, shot1Svg, 'utf8');

  // 2. Screenshot 2: Standby Replica Promotion & Recovery Verification
  const shot2Path = path.join(SAMPLE_MEDIA_DIR, 'standby-failover-verification.svg');
  const shot2Svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 600" width="1100" height="600">
    <rect width="1100" height="600" fill="#0F172A"/>
    <rect x="24" y="24" width="1052" height="552" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>
    <rect x="48" y="48" width="410" height="28" rx="4" fill="#0F766E"/>
    <text x="62" y="67" font-family="JetBrains Mono, monospace" font-weight="700" font-size="14" fill="#FFFFFF">STANDBY PROMOTION &amp; POOL GUARD VERIFICATION</text>
    <line x1="48" y1="96" x2="1052" y2="96" stroke="#334155" stroke-width="2"/>
    <rect x="48" y="128" width="480" height="190" rx="6" fill="#0F172A" stroke="#0F766E" stroke-width="2"/>
    <text x="72" y="168" font-family="JetBrains Mono, monospace" font-size="15" fill="#10B981">POST-FAILOVER LATENCY (14:16 UTC)</text>
    <text x="72" y="240" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="56" fill="#F8FAFC">38 ms</text>
    <text x="72" y="282" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">Error rate dropped from 3.8% to 0.00%</text>
    <rect x="564" y="128" width="488" height="190" rx="6" fill="#0F172A" stroke="#334155" stroke-width="2"/>
    <text x="588" y="168" font-family="JetBrains Mono, monospace" font-size="15" fill="#CBD5E1">DATA INTEGRITY AUDIT</text>
    <text x="588" y="240" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="56" fill="#10B981">0 Lost Tx</text>
    <text x="588" y="282" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">100% WAL replication verified across 3 nodes</text>
    <rect x="48" y="346" width="1004" height="196" rx="6" fill="#0F172A" stroke="#334155"/>
    <text x="74" y="392" font-family="JetBrains Mono, monospace" font-size="15" fill="#F8FAFC">[14:11:04 UTC] pool-guard: promoting standby replica eu-central-1b...</text>
    <text x="74" y="432" font-family="JetBrains Mono, monospace" font-size="15" fill="#F8FAFC">[14:11:16 UTC] pool-guard: connection ceiling raised 250 -&gt; 500 with jittered backoff</text>
    <text x="74" y="472" font-family="JetBrains Mono, monospace" font-size="15" fill="#10B981">[14:16:00 UTC] status: HEALTHY · p99=38ms · saturation=41%</text>
  </svg>`;
  fs.writeFileSync(shot2Path, shot2Svg, 'utf8');

  // 3. Video 1: Generate a valid 2-second MP4 using cached ffmpeg if available, or minimal valid MP4 container
  const videoPath = path.join(SAMPLE_MEDIA_DIR, 'failover-replay-demo.mp4');
  if (!fs.existsSync(videoPath)) {
    const ffmpegCandidate = path.join(
      os.homedir(),
      'Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac'
    );
    let generated = false;
    if (fs.existsSync(ffmpegCandidate)) {
      try {
        await execWithoutShell(ffmpegCandidate, [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x0F172A:s=640x360:d=2',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          videoPath
        ]);
        generated = fs.existsSync(videoPath);
      } catch {
        generated = false;
      }
    }
    if (!generated) {
      // Minimal valid ISO Base Media File (ftyp + moov) fallback
      const ftypHex =
        '00000018667479706d703432000000006d70343269736f6d000000086d646174';
      fs.writeFileSync(videoPath, Buffer.from(ftypHex, 'hex'));
    }
  }

  const aliasVideoPath = path.join(SAMPLE_MEDIA_DIR, 'sample-demo.mp4');
  if (fs.existsSync(videoPath) && !fs.existsSync(aliasVideoPath)) {
    fs.copyFileSync(videoPath, aliasVideoPath);
  }

  return [
    {
      id: 'sample-shot-1',
      filename: 'march-incident-telemetry-spike.svg',
      localPath: shot1Path,
      category: 'image',
      caption: 'EU-Central-1 telemetry at 14:06 UTC showing 94% connection pool saturation and 412 ms peak P99 latency.'
    },
    {
      id: 'sample-shot-2',
      filename: 'standby-failover-verification.svg',
      localPath: shot2Path,
      category: 'image',
      caption: 'Standby replica promotion log confirming recovery to 38 ms P99 latency within 14 minutes and 0 lost transactions.'
    },
    {
      id: 'sample-video-1',
      filename: 'failover-replay-demo.mp4',
      localPath: videoPath,
      category: 'video',
      caption: 'Live replay of automated pool-guard failover shifting traffic to eu-central-1b in 12 seconds.'
    }
  ];
}
