export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const withSelectFeedback = (event, next) => {
  event?.currentTarget?.classList?.add("ui-option-picked");
  if (prefersReducedMotion()) {
    next();
    return;
  }
  window.setTimeout(next, 180);
};
