import { ASSETS } from './constants';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Loads the mounds cut-out with crossorigin="anonymous", removes the green
 * edge fringe left by background removal, writes to a blob URL, assigns it to
 * both mound <img> elements, and resolves once both have decoded (or on error).
 */
export function prepareCleanMounds(
  moundL: HTMLImageElement,
  moundR: HTMLImageElement,
  onBlobUrl?: (url: string) => void
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const srcImg = new Image();
      srcImg.crossOrigin = 'anonymous';
      srcImg.decoding = 'async';

      srcImg.onload = () => {
        try {
          const w = srcImg.naturalWidth;
          const h = srcImg.naturalHeight;
          if (!w || !h) {
            resolve();
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve();
            return;
          }

          ctx.drawImage(srcImg, 0, 0);
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;

          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a > 0) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const m = Math.max(r, b);
              const d = (g - m) / 255;
              if (d > 0) {
                const factor = 1 - smoothstep(0.10, 0.38, d);
                data[i + 3] = Math.round(a * factor);
                data[i + 1] = Math.round(Math.min(g, m * 0.96));
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve();
              return;
            }
            const url = URL.createObjectURL(blob);
            onBlobUrl?.(url);
            moundL.src = url;
            moundR.src = url;

            Promise.all([
              moundL.decode().catch(() => undefined),
              moundR.decode().catch(() => undefined),
            ]).then(() => resolve());
          }, 'image/png');
        } catch {
          resolve();
        }
      };

      srcImg.onerror = () => resolve();
      srcImg.src = ASSETS.mounds;
    } catch {
      resolve();
    }
  });
}
