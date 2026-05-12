import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

interface StatCardProps {
  label: string;
  value: number;
  icon?: React.ReactNode;
  color?: string;
  suffix?: string;
}

function useCountUp(target: number, duration = 800) {
  const [count, setCount] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = null;
    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease out cubic
      setCount(Math.round(ease * target));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return count;
}

export default function StatCard({ label, value, icon, color, suffix }: StatCardProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const count = useCountUp(isInView ? value : 0, 900);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        minWidth: 0,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          {label}
        </span>
        {icon && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: color ? `${color}1a` : "var(--surface-2)",
              color: color ?? "var(--muted)",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className="text-3xl font-bold font-mono tracking-tight"
        style={{ color: color ?? "#fff" }}
      >
        {count}
        {suffix && <span className="text-lg font-semibold ml-0.5">{suffix}</span>}
      </p>
    </motion.div>
  );
}
