import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS, CAPTIONS, EASINGS, NAV_ITEMS, S2_CARDS } from './lib/constants';
import { prepareCleanMounds } from './lib/mounds';
import { CameraFrameCache } from './lib/mp4Frames';

type OverlayState =
  | { type: 'none' }
  | { type: 'menu' }
  | { type: 'film' }
  | { type: 'card'; cardIndex: number };

const WORD_LETTERS = ['E', 'm', 'b', 'e', 'r', 's'] as const;
const LETTER_DELAY_OFFSETS = [0, 100, 270, 240, 200, 370] as const;
const CAP_DELAYS = [730, 870, 970, 1000] as const;
const S2_IN_LAGS = [0, 100, 100, 0, 150, 300] as const;
const S2_OUT_LAGS = [100, 0, 0, 300, 150, 0] as const;

function s2CurveFraction(t: number): number {
  if (t < 0.47) {
    return 1 - 1.506 * t;
  }
  return 0.293 * Math.exp(-(t - 0.47) / 0.232);
}

function buildS2Keyframes(forward: boolean): Keyframe[] {
  const vh = window.innerHeight;
  const frames: Keyframe[] = [];
  for (let k = 0; k <= 54; k++) {
    const offset = k / 54;
    const t = offset * 1.8;
    const f = k === 54 ? 0 : s2CurveFraction(t);
    const frac = forward ? f : 1 - f;
    frames.push({
      offset,
      transform: `translateY(${frac * vh}px)`,
      opacity: 1,
    });
  }
  return frames;
}

export default function App() {
  const stageRef = useRef<HTMLElement>(null);
  const plateH1Ref = useRef<HTMLImageElement>(null);
  const plateS2Ref = useRef<HTMLImageElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const moundLRef = useRef<HTMLImageElement>(null);
  const moundRRef = useRef<HTMLImageElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const glyphsRef = useRef<HTMLDivElement>(null);
  const h1TitleSpanRef = useRef<HTMLSpanElement>(null);
  const h1BodySpanRef = useRef<HTMLSpanElement>(null);
  const vcardRef = useRef<HTMLAnchorElement>(null);
  const playSvgRef = useRef<SVGSVGElement>(null);
  const navLinkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const letterRefs = useRef<(HTMLElement | null)[]>([]);
  const capRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const s2TitleRef = useRef<HTMLHeadingElement>(null);
  const s2BodyRef = useRef<HTMLParagraphElement>(null);
  const s2ArrowRef = useRef<HTMLButtonElement>(null);
  const s2CardRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const [section, setSection] = useState<'h1' | 's2'>('h1');
  const [overlay, setOverlay] = useState<OverlayState>({ type: 'none' });

  const sectionRef = useRef<'h1' | 's2'>('h1');
  const lockedRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const activeAnimsRef = useRef<Animation[]>([]);
  const cameraRafRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const transitionTimersRef = useRef<number[]>([]);
  const cacheRef = useRef<CameraFrameCache | null>(null);
  const overlayRef = useRef<OverlayState>({ type: 'none' });

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  const trackAnim = useCallback((anim: Animation | undefined | null) => {
    if (!anim) return;
    activeAnimsRef.current.push(anim);
    anim.onfinish = () => {
      activeAnimsRef.current = activeAnimsRef.current.filter((a) => a !== anim);
    };
  }, []);

  const commitAndCancelAll = useCallback(() => {
    if (cameraRafRef.current !== null) {
      cancelAnimationFrame(cameraRafRef.current);
      cameraRafRef.current = null;
    }
    if (cameraTimerRef.current !== null) {
      window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    for (const tid of transitionTimersRef.current) {
      window.clearTimeout(tid);
    }
    transitionTimersRef.current = [];

    for (const anim of activeAnimsRef.current) {
      try {
        anim.commitStyles();
      } catch {
        // Ignore elements without active effect styles
      }
      try {
        anim.cancel();
      } catch {
        // Ignore
      }
    }
    activeAnimsRef.current = [];
  }, []);

  const clearInlineMotionStyles = useCallback((elements: (HTMLElement | SVGElement | null)[]) => {
    for (const el of elements) {
      if (!el) continue;
      el.style.transform = '';
      el.style.opacity = '';
    }
  }, []);

  const playHeroEntrance = useCallback(
    (baseOffset: number, isReplay: boolean) => {
      const moundR = moundRRef.current;
      const moundL = moundLRef.current;
      const titleSpan = h1TitleSpanRef.current;
      const bodySpan = h1BodySpanRef.current;
      const vcard = vcardRef.current;
      const playSvg = playSvgRef.current;

      if (!isReplay) {
        const plateH1 = plateH1Ref.current;
        if (plateH1) {
          trackAnim(
            plateH1.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], {
              duration: 1350,
              delay: baseOffset,
              easing: EASINGS.QOUT,
              fill: 'both',
            })
          );
        }

        if (logoRef.current) {
          trackAnim(
            logoRef.current.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 300,
              delay: baseOffset + 100,
              easing: EASINGS.COUT,
              fill: 'both',
            })
          );
        }

        navLinkRefs.current.forEach((link, idx) => {
          if (!link) return;
          trackAnim(
            link.animate([{ transform: 'translateY(-110%)' }, { transform: 'none' }], {
              duration: 300,
              delay: baseOffset + (idx + 1) * 100,
              easing: EASINGS.COUT,
              fill: 'both',
            })
          );
        });

        if (menuRef.current) {
          trackAnim(
            menuRef.current.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 200,
              delay: baseOffset + 530,
              easing: 'linear',
              fill: 'both',
            })
          );
        }

        if (glyphsRef.current) {
          trackAnim(
            glyphsRef.current.animate(
              [
                { opacity: 0, transform: 'translateX(10px)' },
                { opacity: 1, transform: 'none' },
              ],
              {
                duration: 400,
                delay: baseOffset + 600,
                easing: EASINGS.COUT,
                fill: 'both',
              }
            )
          );
        }
      }

      if (moundR) {
        trackAnim(
          moundR.animate([{ transform: 'translateX(45%)' }, { transform: 'none' }], {
            duration: 1700,
            delay: baseOffset,
            easing: EASINGS.QOUT,
            fill: 'both',
          })
        );
      }

      if (moundL) {
        trackAnim(
          moundL.animate([{ transform: 'translateX(-45%)' }, { transform: 'none' }], {
            duration: 1700,
            delay: baseOffset + 40,
            easing: EASINGS.QOUT,
            fill: 'both',
          })
        );
      }

      if (titleSpan) {
        trackAnim(
          titleSpan.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], {
            duration: 950,
            delay: baseOffset + 390,
            easing: EASINGS.COUT,
            fill: 'both',
          })
        );
      }

      if (bodySpan) {
        trackAnim(
          bodySpan.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], {
            duration: 900,
            delay: baseOffset + 450,
            easing: EASINGS.COUT,
            fill: 'both',
          })
        );
      }

      if (vcard) {
        trackAnim(
          vcard.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 260,
            delay: baseOffset + 570,
            easing: 'linear',
            fill: 'both',
          })
        );
      }

      letterRefs.current.forEach((letter, i) => {
        if (!letter) return;
        trackAnim(
          letter.animate(
            [
              { opacity: 0, transform: 'translateY(.06em)' },
              { opacity: 1, transform: 'none' },
            ],
            {
              duration: 450,
              delay: baseOffset + 630 + LETTER_DELAY_OFFSETS[i],
              easing: EASINGS.COUT,
              fill: 'both',
            }
          )
        );
      });

      if (playSvg) {
        trackAnim(
          playSvg.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 230,
            delay: baseOffset + 970,
            easing: 'linear',
            fill: 'both',
          })
        );
      }

      capRowRefs.current.forEach((row, i) => {
        if (!row) return;
        trackAnim(
          row.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], {
            duration: 220,
            delay: baseOffset + CAP_DELAYS[i],
            easing: EASINGS.COUT,
            fill: 'both',
          })
        );
      });
    },
    [trackAnim]
  );

  const runCamera = useCallback(
    (forward: boolean, delay: number, duration: number) => {
      const stage = stageRef.current;
      const plateS2 = plateS2Ref.current;
      const canvas = camCanvasRef.current;
      const cache = cacheRef.current;
      if (!stage || !plateS2) return;

      const useFrames = Boolean(cache?.isReady && !reducedMotionRef.current && canvas);

      if (!useFrames) {
        trackAnim(
          plateS2.animate(
            [{ opacity: forward ? 0 : 1 }, { opacity: forward ? 1 : 0 }],
            {
              duration,
              delay,
              easing: EASINGS.COUT,
              fill: 'both',
            }
          )
        );
        return;
      }

      cameraTimerRef.current = window.setTimeout(() => {
        stage.classList.add('cam-on');
        cache!.resetLastDrawn();
        const startTime = performance.now();

        const step = (now: number) => {
          const x = Math.min(1, Math.max(0, (now - startTime) / duration));
          const eased = 1 - Math.pow(1 - x, 3);
          const p = forward ? eased : 1 - eased;
          cache!.scrubTo(p, forward, canvas);

          if (x < 1) {
            cameraRafRef.current = requestAnimationFrame(step);
          } else {
            cameraRafRef.current = null;
            plateS2.style.opacity = forward ? '1' : '0';
            if (!forward) {
              stage.classList.remove('cam-on');
            }
          }
        };

        cameraRafRef.current = requestAnimationFrame(step);
      }, delay);
    },
    [trackAnim]
  );

  const goToS2 = useCallback(() => {
    if (lockedRef.current || sectionRef.current === 's2') return;
    const stage = stageRef.current;
    if (!stage) return;

    sectionRef.current = 's2';
    setSection('s2');

    if (reducedMotionRef.current) {
      stage.classList.add('is-s2');
      return;
    }

    lockedRef.current = true;
    commitAndCancelAll();

    // Compute D: distance from word top to bottom of foreground box + 8px
    const fgEl = fgRef.current;
    const wordEl = wordRef.current;
    const fgRect = fgEl?.getBoundingClientRect();
    const wordRect = wordEl?.getBoundingClientRect();
    const D =
      fgRect && wordRect ? Math.max(200, fgRect.bottom - wordRect.top + 8) : 400;

    // Hero out
    if (h1TitleSpanRef.current) {
      trackAnim(
        h1TitleSpanRef.current.animate(
          [{ transform: 'none' }, { transform: 'translateY(-100%)' }],
          { duration: 280, delay: 0, easing: EASINGS.CIN, fill: 'both' }
        )
      );
    }

    if (h1BodySpanRef.current) {
      trackAnim(
        h1BodySpanRef.current.animate(
          [{ transform: 'none' }, { transform: 'translateY(100%)' }],
          { duration: 250, delay: 50, easing: EASINGS.CIN, fill: 'both' }
        )
      );
    }

    capRowRefs.current.forEach((row, i) => {
      if (!row) return;
      trackAnim(
        row.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], {
          duration: 260,
          delay: i * 20,
          easing: EASINGS.CIN,
          fill: 'both',
        })
      );
    });

    if (vcardRef.current) {
      trackAnim(
        vcardRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 130,
          delay: 350,
          easing: 'linear',
          fill: 'both',
        })
      );
    }

    letterRefs.current.forEach((letter, i) => {
      if (!letter) return;
      trackAnim(
        letter.animate(
          [{ transform: 'none' }, { transform: `translateY(${D}px)` }],
          {
            duration: 450,
            delay: i * 65,
            easing: EASINGS.CIN,
            fill: 'both',
          }
        )
      );
    });

    if (moundLRef.current) {
      trackAnim(
        moundLRef.current.animate(
          [{ transform: 'none' }, { transform: 'translateX(-51%)' }],
          { duration: 560, delay: 20, easing: EASINGS.CIN, fill: 'both' }
        )
      );
    }

    if (moundRRef.current) {
      trackAnim(
        moundRRef.current.animate(
          [{ transform: 'none' }, { transform: 'translateX(51%)' }],
          { duration: 450, delay: 150, easing: EASINGS.CIN, fill: 'both' }
        )
      );
    }

    // Section 2 in (55-keyframe smooth-scroll curve)
    const s2Elements = [
      s2TitleRef.current,
      s2BodyRef.current,
      s2ArrowRef.current,
      s2CardRefs.current[0],
      s2CardRefs.current[1],
      s2CardRefs.current[2],
    ];
    const inKeyframes = buildS2Keyframes(true);
    s2Elements.forEach((el, idx) => {
      if (!el) return;
      trackAnim(
        el.animate(inKeyframes, {
          duration: 1800,
          delay: 180 + S2_IN_LAGS[idx],
          easing: 'linear',
          fill: 'both',
        })
      );
    });

    // Camera forward
    runCamera(true, 550, 1700);

    // Settle at 2300ms
    const settleId = window.setTimeout(() => {
      stage.classList.add('is-s2');
      stage.classList.remove('cam-on');
      if (plateS2Ref.current) {
        plateS2Ref.current.style.opacity = '';
      }
      commitAndCancelAll();
      clearInlineMotionStyles([
        h1TitleSpanRef.current,
        h1BodySpanRef.current,
        vcardRef.current,
        moundLRef.current,
        moundRRef.current,
        ...capRowRefs.current,
        ...letterRefs.current,
        ...s2Elements,
      ]);
      lockedRef.current = false;
    }, 2300);
    transitionTimersRef.current.push(settleId);
  }, [clearInlineMotionStyles, commitAndCancelAll, runCamera, trackAnim]);

  const goToHero = useCallback(() => {
    if (lockedRef.current || sectionRef.current === 'h1') return;
    const stage = stageRef.current;
    if (!stage) return;

    sectionRef.current = 'h1';
    setSection('h1');

    if (reducedMotionRef.current) {
      stage.classList.remove('is-s2');
      return;
    }

    lockedRef.current = true;
    commitAndCancelAll();
    stage.classList.remove('is-s2');

    const s2Elements = [
      s2TitleRef.current,
      s2BodyRef.current,
      s2ArrowRef.current,
      s2CardRefs.current[0],
      s2CardRefs.current[1],
      s2CardRefs.current[2],
    ];
    const outKeyframes = buildS2Keyframes(false);
    s2Elements.forEach((el, idx) => {
      if (!el) return;
      trackAnim(
        el.animate(outKeyframes, {
          duration: 1800,
          delay: S2_OUT_LAGS[idx],
          easing: 'linear',
          fill: 'both',
        })
      );
    });

    // Camera back
    runCamera(false, 200, 1700);

    // Replay hero entrance with 800ms base offset
    playHeroEntrance(800, true);

    const unlockId = window.setTimeout(() => {
      if (plateS2Ref.current) {
        plateS2Ref.current.style.opacity = '';
      }
      lockedRef.current = false;
    }, 2300);
    transitionTimersRef.current.push(unlockId);

    const settleHeroId = window.setTimeout(() => {
      commitAndCancelAll();
      clearInlineMotionStyles([
        h1TitleSpanRef.current,
        h1BodySpanRef.current,
        vcardRef.current,
        playSvgRef.current,
        moundLRef.current,
        moundRRef.current,
        ...capRowRefs.current,
        ...letterRefs.current,
        ...s2Elements,
      ]);
    }, 2600);
    transitionTimersRef.current.push(settleHeroId);
  }, [clearInlineMotionStyles, commitAndCancelAll, playHeroEntrance, runCamera, trackAnim]);

  // Initial load sequence + mounds cleanup + camera frame cache
  useEffect(() => {
    const stage = stageRef.current;
    const plateH1 = plateH1Ref.current;
    const moundL = moundLRef.current;
    const moundR = moundRRef.current;
    if (!stage || !plateH1 || !moundL || !moundR) return;

    const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = rmQuery.matches;
    if (rmQuery.matches) {
      stage.classList.add('rm');
    }

    const cache = new CameraFrameCache();
    cacheRef.current = cache;

    const cacheTimer = window.setTimeout(() => {
      if (!reducedMotionRef.current) {
        cache.load();
      }
    }, 1200);

    let introStarted = false;
    let moundsBlobUrl: string | null = null;
    const startIntro = () => {
      if (introStarted) return;
      introStarted = true;
      stage.classList.remove('pre');

      if (reducedMotionRef.current) {
        lockedRef.current = false;
        return;
      }

      playHeroEntrance(0, false);

      const unlockId = window.setTimeout(() => {
        lockedRef.current = false;
      }, 1450);
      transitionTimersRef.current.push(unlockId);
    };

    const fontsReady = document.fonts ? document.fonts.ready.catch(() => undefined) : Promise.resolve();
    const heroReady = plateH1.decode().catch(() => undefined);
    const moundsReady = prepareCleanMounds(moundL, moundR, (url) => {
      moundsBlobUrl = url;
    });

    Promise.all([fontsReady, heroReady, moundsReady]).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startIntro();
        });
      });
    });

    const failsafeId = window.setTimeout(startIntro, 2500);

    return () => {
      window.clearTimeout(cacheTimer);
      window.clearTimeout(failsafeId);
      commitAndCancelAll();
      cache.destroy();
      if (moundsBlobUrl) {
        URL.revokeObjectURL(moundsBlobUrl);
      }
    };
  }, [commitAndCancelAll, playHeroEntrance]);

  // Wheel, touch, and keyboard triggers
  useEffect(() => {
    let touchStartY = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (overlayRef.current.type !== 'none') return;
      if (Math.abs(e.deltaY) > 4) {
        if (e.deltaY > 4) {
          goToS2();
        } else {
          goToHero();
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (overlayRef.current.type !== 'none') return;
      if (e.touches.length > 0) {
        const dy = touchStartY - e.touches[0].clientY;
        if (dy > 30) {
          goToS2();
        } else if (dy < -30) {
          goToHero();
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlayRef.current.type !== 'none') {
        setOverlay({ type: 'none' });
        return;
      }
      if (overlayRef.current.type !== 'none') return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goToS2();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToHero();
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goToHero, goToS2]);

  return (
    <>
      <main ref={stageRef} className="stage pre">
        {/* 1: Hero plate */}
        <img
          ref={plateH1Ref}
          className="plate plate-h1"
          src={ASSETS.heroPlate}
          alt="Embers Foundry courtyard and iron gate"
          fetchPriority="high"
          decoding="async"
        />

        {/* 2: Section 2 plate */}
        <img
          ref={plateS2Ref}
          className="plate plate-s2"
          src={ASSETS.section2Plate}
          alt="Three-quarter view of Embers Foundry courtyard"
          decoding="async"
        />

        {/* 3: Camera canvas */}
        <canvas ref={camCanvasRef} className="cam" width={1280} height={720} />

        {/* 4: Shade */}
        <div className="shade" />

        {/* 5: Foreground box */}
        <div ref={fgRef} className="fg">
          <div ref={wordRef} className="word" aria-hidden="true">
            <span>
              {WORD_LETTERS.map((ch, idx) => (
                <i
                  key={idx}
                  ref={(el) => {
                    letterRefs.current[idx] = el;
                  }}
                >
                  {ch}
                </i>
              ))}
            </span>
          </div>

          <img
            ref={moundLRef}
            className="mounds mound-l"
            src={ASSETS.mounds}
            crossOrigin="anonymous"
            alt=""
            decoding="async"
          />
          <img
            ref={moundRRef}
            className="mounds mound-r"
            src={ASSETS.mounds}
            crossOrigin="anonymous"
            alt=""
            decoding="async"
          />
        </div>

        {/* 6: Nav */}
        <header className="nav">
          <a
            ref={logoRef}
            href="#top"
            className="logo"
            aria-label="Embers Foundry home"
            onClick={(e) => {
              e.preventDefault();
              setOverlay({ type: 'none' });
              goToHero();
            }}
          >
            <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
              <circle cx="28" cy="28" r="26" stroke="#EDE3DA" strokeWidth="1.6" />
              <circle
                cx="28"
                cy="28"
                r="21"
                stroke="#EDE3DA"
                strokeWidth="0.8"
                strokeDasharray="1.5 3"
              />
              <path
                d="M28 13.5C30.8 18.2 35.5 21.8 35.5 27.6C35.5 32.1 32.2 35.5 28 35.5C23.8 35.5 20.5 32.1 20.5 27.6C20.5 24.4 22.1 21.8 24.1 19.6C24.4 22.1 25.8 23.4 26.8 23.6C26.2 20.5 26.9 16.9 28 13.5ZM28 25.8C26.5 27.7 25.7 29.2 25.7 30.8C25.7 32.1 26.7 33.1 28 33.1C29.3 33.1 30.3 32.1 30.3 30.8C30.3 29.1 29.4 27.6 28 25.8Z"
                fill="#EDE3DA"
                fillRule="evenodd"
                clipRule="evenodd"
              />
              <line
                x1="17"
                y1="41"
                x2="39"
                y2="41"
                stroke="#EDE3DA"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <line
                x1="20"
                y1="45"
                x2="36"
                y2="45"
                stroke="#EDE3DA"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </a>

          <nav aria-label="Primary">
            <ul>
              {NAV_ITEMS.map((item, idx) => (
                <li key={item}>
                  <a
                    ref={(el) => {
                      navLinkRefs.current[idx] = el;
                    }}
                    href={`#${item.toLowerCase()}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (sectionRef.current === 'h1') {
                        goToS2();
                      } else {
                        setOverlay({ type: 'card', cardIndex: idx % S2_CARDS.length });
                      }
                    }}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <button
            ref={menuRef}
            type="button"
            className="menu"
            aria-label="Menu"
            onClick={() => setOverlay((prev) => (prev.type === 'menu' ? { type: 'none' } : { type: 'menu' }))}
          >
            <span />
            <span />
          </button>
        </header>

        {/* 7: Glyph column */}
        <div ref={glyphsRef} className="glyphs" aria-hidden="true">
          {/* 1: Dagger cross */}
          <svg viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="4" y1="5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {/* 2: Diamond outline */}
          <svg viewBox="0 0 16 16" fill="none">
            <polygon points="8,2 14,8 8,14 2,8" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {/* 3: Plus */}
          <svg viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {/* 4: Four dots around a centre dot */}
          <svg viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="1.15" fill="currentColor" />
            <circle cx="8" cy="3.2" r="1.15" fill="currentColor" />
            <circle cx="8" cy="12.8" r="1.15" fill="currentColor" />
            <circle cx="3.2" cy="8" r="1.15" fill="currentColor" />
            <circle cx="12.8" cy="8" r="1.15" fill="currentColor" />
          </svg>
          {/* 5: Eight-spoke asterisk */}
          <svg viewBox="0 0 16 16" fill="none">
            <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" />
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" />
            <line x1="3.75" y1="3.75" x2="12.25" y2="12.25" stroke="currentColor" strokeWidth="1.2" />
            <line x1="12.25" y1="3.75" x2="3.75" y2="12.25" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          {/* 6: Filled four-point star */}
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1.5Q8.75 7.25 14.5 8Q8.75 8.75 8 14.5Q7.25 8.75 1.5 8Q7.25 7.25 8 1.5Z"
              fill="currentColor"
            />
          </svg>
          {/* 7: Triangle with a bar inside */}
          <svg viewBox="0 0 16 16" fill="none">
            <polygon points="8,2.5 14,13.5 2,13.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5" y1="9.8" x2="11" y2="9.8" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </div>

        {/* 8: Hero section */}
        <section className="h1" aria-hidden={section !== 'h1'}>
          <h1>
            <span ref={h1TitleSpanRef}>Forging ancient fire into lasting wisdom.</span>
          </h1>

          <p className="h1-body">
            <span ref={h1BodySpanRef}>
              A timeless craft, where heat and patience shape something greater than metal.
            </span>
          </p>

          <a
            ref={vcardRef}
            href="#film"
            className="vcard"
            aria-label="Play film"
            onClick={(e) => {
              e.preventDefault();
              setOverlay({ type: 'film' });
            }}
          >
            <svg id="play" ref={playSvgRef} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 4 L19 12 L7 20 Z"
                stroke="#EDE3DA"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </a>

          <div className="caps">
            {CAPTIONS.map((cap, idx) => (
              <div key={cap.num} className={`cap cap-${idx + 1}`}>
                <div
                  ref={(el) => {
                    capRowRefs.current[idx] = el;
                  }}
                  className="mi"
                >
                  <span className="num">{cap.num}</span>
                  <span className="ctext">
                    {cap.line1}
                    <br />
                    {cap.line2}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 9: Section 2 */}
        <section className="s2" aria-hidden={section !== 's2'}>
          <h2 ref={s2TitleRef} className="s2-item">
            Unveiling
            <br />
            deep halls
            <br />
            of the forge.
          </h2>

          <p ref={s2BodyRef} className="s2-item">
            Step into the heart of the foundry, where stone and fire work together. Here, ancient
            craftsmanship meets enduring purpose, and every corner holds a story of resilience,
            skill and the timeless pursuit of something lasting.
          </p>

          <button
            ref={s2ArrowRef}
            type="button"
            className="s2-item s2-arrow s2-interactive"
            aria-label="Explore deep halls"
            onClick={() => setOverlay({ type: 'card', cardIndex: 0 })}
          >
            <svg viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <line x1="3" y1="23" x2="23" y2="3" stroke="#EDE3DA" strokeWidth="1.5" />
              <polyline points="8,3 23,3 23,18" stroke="#EDE3DA" strokeWidth="1.5" />
            </svg>
          </button>

          <div className="cards">
            {S2_CARDS.map((card, idx) => (
              <a
                key={card.id}
                ref={(el) => {
                  s2CardRefs.current[idx] = el;
                }}
                href={`#${card.id}`}
                className="card s2-item s2-interactive"
                onClick={(e) => {
                  e.preventDefault();
                  setOverlay({ type: 'card', cardIndex: idx });
                }}
              >
                <div className={`card-bg card-bg-${idx}`} />
                <div className="card-grad" />
                <span className="card-label">Exploring</span>
              </a>
            ))}
          </div>
        </section>
      </main>

      {/* Interactive Overlays */}
      {overlay.type === 'menu' && (
        <div
          className="overlay-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          onClick={() => setOverlay({ type: 'none' })}
        >
          <button
            type="button"
            className="overlay-close"
            aria-label="Close menu"
            onClick={() => setOverlay({ type: 'none' })}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <div
            className="w-full max-w-2xl flex flex-col gap-8 text-[#EDE3DA]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-6 text-xs uppercase tracking-[0.12em] text-[#EDE3DA]/60">
              <button
                type="button"
                className="hover:text-[#EDE3DA] transition-colors cursor-pointer"
                onClick={() => {
                  setOverlay({ type: 'none' });
                  goToHero();
                }}
              >
                01. The Gate
              </button>
              <span>/</span>
              <button
                type="button"
                className="hover:text-[#EDE3DA] transition-colors cursor-pointer"
                onClick={() => {
                  setOverlay({ type: 'none' });
                  goToS2();
                }}
              >
                02. Deep Halls
              </button>
            </div>

            <div className="flex flex-col border-t border-[#EDE3DA]/15">
              {NAV_ITEMS.map((item, idx) => (
                <button
                  key={item}
                  type="button"
                  className="flex items-baseline justify-between py-5 border-b border-[#EDE3DA]/15 text-left hover:opacity-65 transition-opacity cursor-pointer"
                  onClick={() => {
                    setOverlay({ type: 'none' });
                    if (sectionRef.current === 'h1') {
                      goToS2();
                    } else {
                      setOverlay({ type: 'card', cardIndex: idx % S2_CARDS.length });
                    }
                  }}
                >
                  <span className="overlay-display text-3xl sm:text-4xl uppercase tracking-tight">
                    {item}
                  </span>
                  <span className="text-xs uppercase tracking-[0.14em] text-[#EDE3DA]/60">
                    0{idx + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {overlay.type === 'film' && (
        <div
          className="overlay-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Embers Foundry film"
          onClick={() => setOverlay({ type: 'none' })}
        >
          <button
            type="button"
            className="overlay-close"
            aria-label="Close film"
            onClick={() => setOverlay({ type: 'none' })}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <div
            className="w-full max-w-4xl border border-[#EDE3DA]/20 bg-[#1F1815]"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={ASSETS.cameraVideo}
              controls
              autoPlay
              playsInline
              loop
              crossOrigin="anonymous"
              className="w-full aspect-video block bg-[#121110]"
            />
          </div>
        </div>
      )}

      {overlay.type === 'card' && (
        <div
          className="overlay-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={S2_CARDS[overlay.cardIndex].title}
          onClick={() => setOverlay({ type: 'none' })}
        >
          <button
            type="button"
            className="overlay-close"
            aria-label="Close gallery"
            onClick={() => setOverlay({ type: 'none' })}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" />
              <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <div
            className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 border border-[#EDE3DA]/15 bg-[#1F1815]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`overlay-card-art card-bg-${overlay.cardIndex} aspect-square w-full bg-no-repeat border-b md:border-b-0 md:border-r border-[#EDE3DA]/12`}
            />
            <div className="p-8 flex flex-col justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[#C5794B] mb-3">
                  {S2_CARDS[overlay.cardIndex].subtitle}
                </p>
                <h3 className="overlay-display text-2xl uppercase mb-4 text-[#EDE3DA]">
                  {S2_CARDS[overlay.cardIndex].title}
                </h3>
                <p className="text-sm leading-relaxed text-[#EDE3DA]/85">
                  {S2_CARDS[overlay.cardIndex].description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#EDE3DA]/12 text-xs uppercase tracking-[0.12em]">
                <button
                  type="button"
                  className="hover:opacity-65 transition-opacity cursor-pointer"
                  onClick={() =>
                    setOverlay({
                      type: 'card',
                      cardIndex: (overlay.cardIndex + S2_CARDS.length - 1) % S2_CARDS.length,
                    })
                  }
                >
                  Prev
                </button>
                <span className="text-[#EDE3DA]/50">
                  0{overlay.cardIndex + 1} / 0{S2_CARDS.length}
                </span>
                <button
                  type="button"
                  className="hover:opacity-65 transition-opacity cursor-pointer"
                  onClick={() =>
                    setOverlay({
                      type: 'card',
                      cardIndex: (overlay.cardIndex + 1) % S2_CARDS.length,
                    })
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
