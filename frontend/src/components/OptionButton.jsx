/* eslint-disable react/prop-types */
import { withSelectFeedback } from "../lib/motion";

const OptionButton = ({ selected, disabled, className = "", onSelect, children }) => (
  <button
    type="button"
    disabled={disabled}
    className={`ui-option ui-press ${selected ? "ui-option-on" : ""} ${className}`}
    onClick={(event) => withSelectFeedback(event, onSelect)}
  >
    {children}
    {selected ? <span className="ui-option-check" aria-hidden="true">✓</span> : null}
  </button>
);

export default OptionButton;
