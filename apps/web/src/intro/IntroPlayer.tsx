import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { markIntroSeen } from './introStorage';
import { INTRO_MEDIA } from './media';
import './IntroPlayer.css';

export type IntroDoneReason = 'ended' | 'skipped';
export type IntroPrep = { state: 'working'; percent: number } | { state: 'ready' } | { state: 'error' };

type Props = {
  onDone: (reason: IntroDoneReason) => void;
  /** Label of the always-visible exit button. */
  skipLabel?: string;
  /** Progress of the background demo preparation, shown under the video. Omit when there is none. */
  prep?: IntroPrep;
};

function prepMessage(prep: IntroPrep): string {
  switch (prep.state) {
    case 'working':
      return `Mientras miras el video, preparamos tu demo (${prep.percent}%).`;
    case 'ready':
      return 'Tu demo ya está lista. Al terminar el video entrarás directo.';
    case 'error':
      return 'Hubo un problema al preparar la demo. Podrás reintentarlo al entrar.';
  }
}

/** Full-screen explainer video: poster and big play button first (sound only starts after the tap), Spanish captions. */
export function IntroPlayer({ onDone, skipLabel = 'Saltar e ir a la demo', prep }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(
    (reason: IntroDoneReason) => {
      if (doneRef.current) return;
      doneRef.current = true;
      markIntroSeen();
      videoRef.current?.pause();
      onDone(reason);
    },
    [onDone],
  );

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    playRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    video.muted = false;
    try {
      await video.play();
    } catch {
      // The browser refused (rare after a tap): the native controls are now visible so the person can press play.
    }
    video.focus();
  }, []);

  // Keep Tab inside the dialog and let Escape skip.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish('skipped');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button, video[controls]') ?? []).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={rootRef} className="intro" role="dialog" aria-modal="true" aria-label="Video: cómo funciona PROCTO" onKeyDown={onKeyDown}>
      <div className="intro__top">
        <p className="intro__title">Así funciona PROCTO</p>
        <button type="button" className="intro__skip" onClick={() => finish('skipped')}>
          {skipLabel}
        </button>
      </div>

      <div className="intro__stage">
        <video
          ref={videoRef}
          className="intro__video"
          src={INTRO_MEDIA.video}
          poster={INTRO_MEDIA.poster}
          preload="metadata"
          playsInline
          controls={started}
          tabIndex={started ? 0 : -1}
          onEnded={() => finish('ended')}
          onError={() => setFailed(true)}
          aria-label="Video explicativo de PROCTO, con subtítulos en español"
        >
          <track kind="captions" srcLang="es" label="Español" src={INTRO_MEDIA.captions} default />
          Tu navegador no puede reproducir este video. Puedes saltarlo e ir a la demo.
        </video>

        {!started && !failed ? (
          <button ref={playRef} type="button" className="intro__play" onClick={() => void play()}>
            <span aria-hidden="true" className="intro__play-icon">
              ▶
            </span>
            <span>Ver video ({INTRO_MEDIA.durationLabel})</span>
          </button>
        ) : null}

        {failed ? (
          <p className="intro__failed" role="alert">
            No pudimos cargar el video. Puedes continuar sin verlo.
          </p>
        ) : null}
      </div>

      <p className="intro__prep" role="status" aria-live="polite">
        {prep ? prepMessage(prep) : ''}
      </p>
    </div>
  );
}
