/* eslint-disable react/prop-types */
const BrandMark = ({ size = 28, showWordmark = true, className = "" }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <img src="/favicon.svg" alt="" width={size} height={size} className="rounded-lg shadow-sm" />
    {showWordmark && <span className="font-semibold tracking-tight">VibeLink</span>}
  </span>
);

export default BrandMark;
