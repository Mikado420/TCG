import React, { useEffect, useState } from 'react';
import { Smartphone, RotateCw } from 'lucide-react';

export const OrientationWarning: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState<boolean>(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check window aspect ratio and screen orientation
      const isWindowPortrait = window.innerHeight > window.innerWidth;
      const isScreenPortrait =
        typeof window.orientation !== 'undefined'
          ? window.orientation === 0 || window.orientation === 180
          : false;
      const isMatchMediaPortrait = window.matchMedia('(orientation: portrait)').matches;

      // Only trigger if screen is narrow and tall (likely a phone/small tablet in portrait)
      const isNarrowDevice = window.innerWidth < 768;

      setIsPortrait(isNarrowDevice && (isWindowPortrait || isScreenPortrait || isMatchMediaPortrait));
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    // Try Screen Orientation Lock if available
    try {
      if (screen.orientation && 'lock' in screen.orientation) {
        (screen.orientation as any).lock('landscape').catch(() => {
          // Lock may not be permitted in all browsers without user gesture
        });
      }
    } catch (e) {
      // Ignore
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div
      id="orientation-warning-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-950/95 backdrop-blur-md p-6 text-center text-stone-100 animate-fade-in"
    >
      <div className="relative mb-6">
        <Smartphone className="w-16 h-16 text-amber-400 animate-bounce" />
        <RotateCw className="w-8 h-8 text-amber-300 absolute -top-2 -right-2 animate-spin duration-3000" />
      </div>

      <h2 className="text-xl font-black text-white mb-2 tracking-wide">
        端末を横向きにしてください
      </h2>
      <p className="text-xs text-stone-400 max-w-xs leading-relaxed mb-6">
        本TCGシミュレーターは、スマートフォン横画面で最適にプレイできるように設計されています。
      </p>

      <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-2 text-xs text-amber-300/90 font-medium">
        画面の自動回転をONにして横向きにしてください
      </div>
    </div>
  );
};
