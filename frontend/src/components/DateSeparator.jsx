/* eslint-disable react/prop-types */
import { formatConversationDayLabel } from "../lib/time";

const DateSeparator = ({ createdAt }) => {
  const label = formatConversationDayLabel(createdAt);
  if (!label) return null;
  return (
    <div className="flex items-center gap-3 py-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-base-300" />
      <span className="shrink-0 text-[11px] font-semibold tracking-wide text-base-content/50">{label}</span>
      <span className="h-px flex-1 bg-base-300" />
    </div>
  );
};

export default DateSeparator;
