import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// Hero video player. Lazy-loads via IntersectionObserver and cycles through a
// playlist of clips (advances on `ended`) so the hero shows variety instead of
// looping the same clip. Exposes an unmute control (browsers block
// autoplay-with-sound until the visitor interacts).
export default function HeroVideo({ srcs, className = '' }: { srcs: string[]; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [muted, setMuted] = useState(true);
  const [index, setIndex] = useState(0);

  const list = srcs.length ? srcs : [''];
  const multiple = list.length > 1;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShouldLoad(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // When the current clip ends, advance to the next (wrap around). With a
  // single clip we loop it instead.
  function onEnded() {
    if (multiple) setIndex((i) => (i + 1) % list.length);
  }

  // Keep playing across source swaps; preserve mute state.
  useEffect(() => {
    const vid = videoRef.current;
    if (vid && shouldLoad) vid.play().catch(() => {});
  }, [index, shouldLoad]);

  function toggleMute() {
    const vid = videoRef.current;
    if (!vid) return;
    const next = !muted;
    vid.muted = next;
    setMuted(next);
    if (!next) vid.play().catch(() => {});
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <video
        ref={videoRef}
        key={index}
        src={shouldLoad ? list[index] : undefined}
        autoPlay
        muted={muted}
        loop={!multiple}
        playsInline
        onEnded={onEnded}
        preload={shouldLoad ? 'auto' : 'none'}
        className="aspect-video w-full object-cover"
      />

      {/* Playlist dots */}
      {multiple && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Video ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={toggleMute}
        className="group absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-po-ink/85 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur transition-all hover:scale-105 hover:bg-po-ink sm:right-4 sm:top-4"
        aria-label={muted ? 'Unmute video' : 'Mute video'}
      >
        {muted ? (
          <>
            <VolumeX className="h-4 w-4 text-po-amber" />
            <span className="hidden sm:inline">Klik untuk dengar</span>
            <span className="sm:hidden">Sound</span>
          </>
        ) : (
          <>
            <Volume2 className="h-4 w-4 text-po-success" />
            <span className="hidden sm:inline">Mute</span>
          </>
        )}
      </button>
    </div>
  );
}
