import toast from "react-hot-toast";

// The same failure (e.g. "Unauthorized.") can fire from several requests at once.
// Giving error toasts an id based on their text makes repeats replace each other instead of stacking.
const showError = toast.error;
toast.error = (message, options = {}) => showError(message, {
  ...(typeof message === "string" ? { id: `error:${message}` } : {}),
  ...options,
});
