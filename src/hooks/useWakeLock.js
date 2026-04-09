import { useEffect, useRef, useState } from 'react';

export function useWakeLock() {
  const wakeLockRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setActive(true);
      wakeLockRef.current.addEventListener('release', () => {
        setActive(false);
      });
    } catch (err) {
      console.warn('Wake Lock 요청 실패:', err);
    }
  };

  useEffect(() => {
    if ('wakeLock' in navigator) {
      setSupported(true);
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release();
    };
  }, []);

  return { supported, active };
}
