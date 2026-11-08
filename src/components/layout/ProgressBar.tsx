import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

export function ProgressBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (prevPathRef.current === location.pathname) return;
    prevPathRef.current = location.pathname;

    const timer1 = setTimeout(() => setProgress(60), 20);
    const timer2 = setTimeout(() => setProgress(100), 120);
    const timer3 = setTimeout(() => setProgress(0), 300);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [location.pathname]);

  if (progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 top-0 z-50 h-[2.5px] w-full overflow-hidden bg-transparent pointer-events-none"
    >
      <div
        className="h-full bg-(--color-primary) transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
