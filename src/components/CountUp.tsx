import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

/** "120+" / "98%" kabi qiymatni 0 dan sanab ko'rsatadi (ko'rinish zonasiga kirganda). */
const CountUp = ({ value }: { value: string }) => {
  const m = /^(\d+)(.*)$/.exec(value);
  const target = m ? Number(m[1]) : 0;
  const suffix = m ? m[2] : "";
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, target, { duration: 1.4, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, target]);
  if (!m) return <>{value}</>;
  return <span ref={ref}>{n}{suffix}</span>;
};

export default CountUp;
