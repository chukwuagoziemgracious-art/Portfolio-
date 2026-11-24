import { ASSETS } from './constants';

export interface CachedFrame {
  ts: number;
  blob: Blob;
}

interface BoxRange {
  type: string;
  start: number;
  headerSize: number;
  end: number;
}

interface ParsedTrack {
  codec: string;
  avcC: Uint8Array;
  timescale: number;
  samples: {
    offset: number;
    size: number;
    isKey: boolean;
    ptsUs: number;
    durUs: number;
  }[];
}

function readType(u8: Uint8Array, offset: number): string {
  return String.fromCharCode(
    u8[offset],
    u8[offset + 1],
    u8[offset + 2],
    u8[offset + 3]
  );
}

function readU64(dv: DataView, offset: number): number {
  const hi = dv.getUint32(offset);
  const lo = dv.getUint32(offset + 4);
  return hi * 4294967296 + lo;
}

function iterBoxes(
  dv: DataView,
  u8: Uint8Array,
  start: number,
  end: number
): BoxRange[] {
  const out: BoxRange[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = dv.getUint32(pos);
    const type = readType(u8, pos + 4);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      size = readU64(dv, pos + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) break;
    out.push({ type, start: pos, headerSize, end: pos + size });
    pos += size;
  }
  return out;
}

function findBox(
  dv: DataView,
  u8: Uint8Array,
  start: number,
  end: number,
  target: string
): BoxRange | null {
  for (const box of iterBoxes(dv, u8, start, end)) {
    if (box.type === target) return box;
  }
  return null;
}

function parseMp4VideoTrack(buffer: ArrayBuffer): ParsedTrack | null {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const moov = findBox(dv, u8, 0, u8.length, 'moov');
  if (!moov) return null;

  const traks = iterBoxes(dv, u8, moov.start + moov.headerSize, moov.end).filter(
    (b) => b.type === 'trak'
  );

  for (const trak of traks) {
    const mdia = findBox(dv, u8, trak.start + trak.headerSize, trak.end, 'mdia');
    if (!mdia) continue;

    const hdlr = findBox(dv, u8, mdia.start + mdia.headerSize, mdia.end, 'hdlr');
    if (hdlr) {
      const hdlrType = readType(u8, hdlr.start + hdlr.headerSize + 8);
      if (hdlrType !== 'vide') continue;
    }

    let timescale = 24000;
    const mdhd = findBox(dv, u8, mdia.start + mdia.headerSize, mdia.end, 'mdhd');
    if (mdhd) {
      const p = mdhd.start + mdhd.headerSize;
      const version = u8[p];
      timescale = version === 1 ? dv.getUint32(p + 20) : dv.getUint32(p + 12);
      if (!timescale) timescale = 24000;
    }

    const minf = findBox(dv, u8, mdia.start + mdia.headerSize, mdia.end, 'minf');
    if (!minf) continue;
    const stbl = findBox(dv, u8, minf.start + minf.headerSize, minf.end, 'stbl');
    if (!stbl) continue;

    const stblStart = stbl.start + stbl.headerSize;
    const stsd = findBox(dv, u8, stblStart, stbl.end, 'stsd');
    const stsz = findBox(dv, u8, stblStart, stbl.end, 'stsz');
    const stsc = findBox(dv, u8, stblStart, stbl.end, 'stsc');
    const stco = findBox(dv, u8, stblStart, stbl.end, 'stco');
    const co64 = findBox(dv, u8, stblStart, stbl.end, 'co64');
    const stss = findBox(dv, u8, stblStart, stbl.end, 'stss');
    const stts = findBox(dv, u8, stblStart, stbl.end, 'stts');
    const ctts = findBox(dv, u8, stblStart, stbl.end, 'ctts');

    if (!stsd || !stsz || !stsc || (!stco && !co64)) continue;

    // Parse stsd -> avc1/avc3 -> avcC
    const stsdPayload = stsd.start + stsd.headerSize;
    const entryCount = dv.getUint32(stsdPayload + 4);
    if (entryCount < 1) continue;

    const sampleEntries = iterBoxes(dv, u8, stsdPayload + 8, stsd.end);
    let avcC: Uint8Array | null = null;
    for (const entry of sampleEntries) {
      if (entry.type === 'avc1' || entry.type === 'avc3') {
        // VisualSampleEntry has 78 bytes after 8-byte box header before child boxes
        const childrenStart = entry.start + entry.headerSize + 78;
        const avcCBox = findBox(dv, u8, childrenStart, entry.end, 'avcC');
        if (avcCBox) {
          avcC = u8.slice(avcCBox.start + avcCBox.headerSize, avcCBox.end);
          break;
        }
      }
    }
    if (!avcC || avcC.length < 4) continue;

    const hex = (n: number) => n.toString(16).padStart(2, '0');
    const codec = `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;

    // Parse stsz
    const stszP = stsz.start + stsz.headerSize;
    const defaultSize = dv.getUint32(stszP + 4);
    const sampleCount = dv.getUint32(stszP + 8);
    const sizes = new Uint32Array(sampleCount);
    if (defaultSize !== 0) {
      sizes.fill(defaultSize);
    } else {
      for (let i = 0; i < sampleCount; i++) {
        sizes[i] = dv.getUint32(stszP + 12 + i * 4);
      }
    }

    // Parse stsc
    const stscP = stsc.start + stsc.headerSize;
    const stscCount = dv.getUint32(stscP + 4);
    const stscEntries: { firstChunk: number; samplesPerChunk: number }[] = [];
    for (let i = 0; i < stscCount; i++) {
      const base = stscP + 8 + i * 12;
      stscEntries.push({
        firstChunk: dv.getUint32(base),
        samplesPerChunk: dv.getUint32(base + 4),
      });
    }

    // Parse stco / co64
    const chunkOffsets: number[] = [];
    if (stco) {
      const p = stco.start + stco.headerSize;
      const count = dv.getUint32(p + 4);
      for (let i = 0; i < count; i++) {
        chunkOffsets.push(dv.getUint32(p + 8 + i * 4));
      }
    } else if (co64) {
      const p = co64.start + co64.headerSize;
      const count = dv.getUint32(p + 4);
      for (let i = 0; i < count; i++) {
        chunkOffsets.push(readU64(dv, p + 8 + i * 8));
      }
    }

    // Parse stss
    const syncSet = new Set<number>();
    if (stss) {
      const p = stss.start + stss.headerSize;
      const count = dv.getUint32(p + 4);
      for (let i = 0; i < count; i++) {
        syncSet.add(dv.getUint32(p + 8 + i * 4)); // 1-based sample number
      }
    }

    // Parse stts -> dts & dur
    const dtsArr = new Float64Array(sampleCount);
    const durArr = new Float64Array(sampleCount);
    if (stts) {
      const p = stts.start + stts.headerSize;
      const count = dv.getUint32(p + 4);
      let sIdx = 0;
      let curDts = 0;
      for (let i = 0; i < count && sIdx < sampleCount; i++) {
        const runCount = dv.getUint32(p + 8 + i * 8);
        const delta = dv.getUint32(p + 12 + i * 8);
        for (let j = 0; j < runCount && sIdx < sampleCount; j++) {
          dtsArr[sIdx] = curDts;
          durArr[sIdx] = delta;
          curDts += delta;
          sIdx++;
        }
      }
    } else {
      const defaultDelta = timescale / 24;
      for (let i = 0; i < sampleCount; i++) {
        dtsArr[i] = i * defaultDelta;
        durArr[i] = defaultDelta;
      }
    }

    // Parse ctts -> composition offset
    const ctsOffsetArr = new Float64Array(sampleCount);
    if (ctts) {
      const p = ctts.start + ctts.headerSize;
      const version = u8[p];
      const count = dv.getUint32(p + 4);
      let sIdx = 0;
      for (let i = 0; i < count && sIdx < sampleCount; i++) {
        const runCount = dv.getUint32(p + 8 + i * 8);
        const offset =
          version === 1
            ? dv.getInt32(p + 12 + i * 8)
            : dv.getUint32(p + 12 + i * 8);
        for (let j = 0; j < runCount && sIdx < sampleCount; j++) {
          ctsOffsetArr[sIdx] = offset;
          sIdx++;
        }
      }
    }

    // Map samples to file offsets
    const samples: ParsedTrack['samples'] = [];
    let sIdx = 0;
    let stscIdx = 0;
    for (let chunkIdx = 0; chunkIdx < chunkOffsets.length && sIdx < sampleCount; chunkIdx++) {
      const chunkNum = chunkIdx + 1;
      while (
        stscIdx + 1 < stscEntries.length &&
        chunkNum >= stscEntries[stscIdx + 1].firstChunk
      ) {
        stscIdx++;
      }
      const spc = stscEntries[stscIdx]?.samplesPerChunk ?? 1;
      let offset = chunkOffsets[chunkIdx];
      for (let j = 0; j < spc && sIdx < sampleCount; j++) {
        const size = sizes[sIdx];
        const ptsTicks = dtsArr[sIdx] + ctsOffsetArr[sIdx];
        const ptsUs = Math.round((ptsTicks / timescale) * 1_000_000);
        const durUs = Math.round((durArr[sIdx] / timescale) * 1_000_000);
        const isKey = stss ? syncSet.has(sIdx + 1) : sIdx === 0;
        samples.push({ offset, size, isKey, ptsUs, durUs });
        offset += size;
        sIdx++;
      }
    }

    return { codec, avcC, timescale, samples };
  }

  return null;
}

async function decodeWithWebCodecs(buffer: ArrayBuffer): Promise<CachedFrame[]> {
  if (typeof VideoDecoder === 'undefined') {
    throw new Error('WebCodecs unavailable');
  }

  const track = parseMp4VideoTrack(buffer);
  if (!track || track.samples.length === 0) {
    throw new Error('Could not parse MP4 track');
  }

  const support = await VideoDecoder.isConfigSupported({
    codec: track.codec,
    description: track.avcC,
  });
  if (!support.supported) {
    throw new Error('Codec config unsupported');
  }

  const offCanvas = document.createElement('canvas');
  offCanvas.width = 1280;
  offCanvas.height = 720;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) throw new Error('No 2D context');

  const u8 = new Uint8Array(buffer);
  const frames: CachedFrame[] = [];
  let encodeChain = Promise.resolve();
  let decodeError: Error | null = null;

  const decoder = new VideoDecoder({
    output: (frame) => {
      const ts = frame.timestamp ?? 0;
      encodeChain = encodeChain.then(
        () =>
          new Promise<void>((resolve) => {
            try {
              offCtx.drawImage(frame, 0, 0, 1280, 720);
            } finally {
              frame.close();
            }
            offCanvas.toBlob(
              (blob) => {
                if (blob) frames.push({ ts, blob });
                resolve();
              },
              'image/jpeg',
              0.86
            );
          })
      );
    },
    error: (err) => {
      decodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  decoder.configure({
    codec: track.codec,
    description: track.avcC,
  });

  for (let i = 0; i < track.samples.length; i++) {
    if (decodeError) throw decodeError;
    const s = track.samples[i];
    const data = u8.subarray(s.offset, s.offset + s.size);
    decoder.decode(
      new EncodedVideoChunk({
        type: s.isKey ? 'key' : 'delta',
        timestamp: s.ptsUs,
        duration: s.durUs,
        data,
      })
    );
    // Keep decoder queue bounded so hardware VideoFrame buffers never stall
    if (decoder.decodeQueueSize > 6) {
      await new Promise((r) => setTimeout(r, 8));
    }
  }

  await decoder.flush();
  await encodeChain;
  decoder.close();

  if (decodeError) throw decodeError;
  frames.sort((a, b) => a.ts - b.ts);
  return frames;
}

async function decodeWithRVFC(videoUrl: string): Promise<CachedFrame[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.style.position = 'fixed';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.left = '-9999px';
    document.body.appendChild(video);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 1280;
    offCanvas.height = 720;
    const offCtx = offCanvas.getContext('2d');

    const frames: CachedFrame[] = [];
    const seen = new Set<number>();
    let encodeChain = Promise.resolve();
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      frames.sort((a, b) => a.ts - b.ts);
      resolve(frames);
    };

    const hasRVFC = 'requestVideoFrameCallback' in video;
    if (!hasRVFC || !offCtx) {
      cleanup();
      return;
    }

    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (settled) return;
      const ts = Math.round(metadata.mediaTime * 1_000_000);
      if (!seen.has(ts)) {
        seen.add(ts);
        try {
          offCtx.drawImage(video, 0, 0, 1280, 720);
          encodeChain = encodeChain.then(
            () =>
              new Promise<void>((res) => {
                offCanvas.toBlob(
                  (blob) => {
                    if (blob) frames.push({ ts, blob });
                    res();
                  },
                  'image/jpeg',
                  0.86
                );
              })
          );
        } catch {
          // ignore tainted or empty frame
        }
      }
      if (!video.ended && !video.paused) {
        video.requestVideoFrameCallback(onFrame);
      }
    };

    video.onended = () => {
      encodeChain.then(cleanup);
    };
    video.onerror = () => cleanup();

    video.src = videoUrl;
    video
      .play()
      .then(() => {
        video.requestVideoFrameCallback(onFrame);
      })
      .catch(() => cleanup());

    setTimeout(() => {
      if (!settled) encodeChain.then(cleanup);
    }, 15000);
  });
}

export class CameraFrameCache {
  private frames: CachedFrame[] = [];
  private bitmaps = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private lastDrawnIdx = -1;
  private destroyed = false;

  get isReady(): boolean {
    return this.frames.length > 20;
  }

  get count(): number {
    return this.frames.length;
  }

  async load(): Promise<void> {
    try {
      const res = await fetch(ASSETS.cameraVideo, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      if (this.destroyed) return;

      let decoded: CachedFrame[] = [];
      try {
        decoded = await decodeWithWebCodecs(buffer);
      } catch {
        // Fallback to hidden muted video + requestVideoFrameCallback
        const blobUrl = URL.createObjectURL(
          new Blob([buffer], { type: 'video/mp4' })
        );
        try {
          decoded = await decodeWithRVFC(blobUrl);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      }

      if (!this.destroyed && decoded.length > 0) {
        this.frames = decoded;
        this.warmEndpoints();
      }
    } catch {
      // Cache stays empty; runCamera falls back to plate-s2 crossfade
    }
  }

  private warmEndpoints(): void {
    const indices = [0, this.frames.length - 1];
    for (const idx of indices) {
      if (idx < 0 || this.bitmaps.has(idx) || this.decoding.has(idx)) continue;
      this.decoding.add(idx);
      createImageBitmap(this.frames[idx].blob)
        .then((bmp) => {
          if (this.destroyed) {
            bmp.close();
            return;
          }
          this.bitmaps.set(idx, bmp);
        })
        .catch(() => undefined)
        .finally(() => {
          this.decoding.delete(idx);
        });
    }
  }

  scrubTo(
    progress: number,
    forward: boolean,
    canvas: HTMLCanvasElement | null
  ): void {
    if (!canvas || this.frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clamped = Math.max(0, Math.min(1, progress));
    const target = Math.round(clamped * (this.frames.length - 1));
    const dir = forward ? 1 : -1;

    // Decode up to 6 frames ahead in direction of travel, max 4 in flight
    for (let step = 0; step <= 6; step++) {
      if (this.decoding.size >= 4) break;
      const idx = target + step * dir;
      if (idx < 0 || idx >= this.frames.length) continue;
      if (this.bitmaps.has(idx) || this.decoding.has(idx)) continue;

      this.decoding.add(idx);
      createImageBitmap(this.frames[idx].blob)
        .then((bmp) => {
          if (this.destroyed) {
            bmp.close();
            return;
          }
          this.bitmaps.set(idx, bmp);
        })
        .catch(() => undefined)
        .finally(() => {
          this.decoding.delete(idx);
        });
    }

    // Draw nearest already-decoded frame at or behind the target
    let drawIdx = -1;
    for (let offset = 0; offset < this.frames.length; offset++) {
      const candidate = target - offset * dir;
      if (candidate >= 0 && candidate < this.frames.length && this.bitmaps.has(candidate)) {
        drawIdx = candidate;
        break;
      }
    }
    if (drawIdx === -1) {
      // Fallback: check ahead if nothing decoded behind yet
      for (let offset = 1; offset <= 6; offset++) {
        const candidate = target + offset * dir;
        if (candidate >= 0 && candidate < this.frames.length && this.bitmaps.has(candidate)) {
          drawIdx = candidate;
          break;
        }
      }
    }

    if (drawIdx !== -1 && drawIdx !== this.lastDrawnIdx) {
      const bmp = this.bitmaps.get(drawIdx);
      if (bmp) {
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        this.lastDrawnIdx = drawIdx;
      }
    }

    // Prune bitmaps more than 10 frames away once > 24 are cached
    if (this.bitmaps.size > 24) {
      for (const [idx, bmp] of this.bitmaps.entries()) {
        if (Math.abs(idx - target) > 10 && idx !== this.lastDrawnIdx) {
          bmp.close();
          this.bitmaps.delete(idx);
        }
      }
    }
  }

  resetLastDrawn(): void {
    this.lastDrawnIdx = -1;
  }

  destroy(): void {
    this.destroyed = true;
    for (const bmp of this.bitmaps.values()) {
      bmp.close();
    }
    this.bitmaps.clear();
    this.decoding.clear();
    this.frames = [];
  }
}
