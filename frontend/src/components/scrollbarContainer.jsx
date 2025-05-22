import { useEffect, useRef, useState } from 'react';

const ScrollContainer = ({ children, className = '' }) => {
  const containerRef = useRef(null);
  const [showScrollbar, setShowScrollbar] = useState(false);

  useEffect(() => {
    const ref = containerRef.current;
    if (!ref) return;

    const handleScroll = () => {
      setShowScrollbar(true);
      clearTimeout(ref._timeout);
      ref._timeout = setTimeout(() => setShowScrollbar(false), 1000);
    };

    ref.addEventListener('scroll', handleScroll);
    return () => {
      ref.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-y-auto transition-[scrollbar-color] duration-500 ease-in-out 
        ${showScrollbar ? 'scrollbar-visible' : 'scrollbar-hidden'} ${className}`}
    >
      {children}
    </div>
  );
};

export default ScrollContainer;
