import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// Hero video player. Lazy-loads via IntersectionObserver and exposes a
// prominent unmute control (browsers block autoplay-with-sound until the
// visitor interacts).
export default function HeroVideo({ src, className = '' }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [muted, setMuted] = useState(true);

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
        src={shouldLoad ? src : undefined}
        autoPlay
        muted
        loop
        playsInline
        preload={shouldLoad ? 'auto' : 'none'}
        className="aspect-video w-full object-cover"
      />
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
