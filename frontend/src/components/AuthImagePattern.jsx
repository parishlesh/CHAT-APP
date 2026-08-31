/* eslint-disable react/prop-types */
const AuthImagePattern = ({ title, subtitle }) => (
  <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-600 to-rose-500 p-12 text-white lg:flex lg:flex-col lg:justify-end">
    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15" />
    <div className="pointer-events-none absolute bottom-24 left-10 h-24 w-24 rounded-full bg-white/10" />
    <div className="relative max-w-sm">
      <p className="text-3xl font-semibold tracking-tight">{title}</p>
      <p className="mt-3 text-sm leading-relaxed text-white/80">{subtitle}</p>
    </div>
  </div>
);

export default AuthImagePattern;
