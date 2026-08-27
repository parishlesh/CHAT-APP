/* eslint-disable react/prop-types */
import { forwardRef, useEffect, useState } from "react";

const ScrollContainer = forwardRef(({ children, className = "", onScroll }, ref) => {
  const [showScrollbar, setShowScrollbar] = useState(false);

  useEffect(() => {
    const node = ref && typeof ref === "object" ? ref.current : null;
    if (!node) return;
    const handleScroll = () => {
      setShowScrollbar(true);
      clearTimeout(node._timeout);
      node._timeout = setTimeout(() => setShowScrollbar(false), 1000);
    };
    node.addEventListener("scroll", handleScroll);
    return () => node.removeEventListener("scroll", handleScroll);
  }, [ref]);

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={`overflow-y-auto transition-[scrollbar-color] duration-500 ease-in-out 
        ${showScrollbar ? "scrollbar-visible" : "scrollbar-hidden"} ${className}`}
    >
      {children}
    </div>
  );
});

ScrollContainer.displayName = "ScrollContainer";

export default ScrollContainer;
