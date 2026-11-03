/** Yurak urishi (EKG) chizig'i: o'zi chizilib, so'nib, qayta boshlanadi. Hero'ning asosiy elementi. */
const PATH = "M0 40 H60 L72 40 L80 26 L88 40 H120 L132 46 L142 6 L154 72 L164 40 H210 L222 34 L236 40 H300 L312 40 L320 26 L328 40 H360 L372 46 L382 6 L394 72 L404 40 H450 L462 34 L476 40 H540";

const EcgLine = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 540 80" preserveAspectRatio="none" className={className} aria-hidden="true">
    <path d={PATH} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <path d={PATH} pathLength={1} className="ecg-trace" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>
);

export default EcgLine;
