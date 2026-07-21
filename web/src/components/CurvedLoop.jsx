import { useEffect, useId, useRef, useState } from "react";

const VIEWBOX_WIDTH = 1600;
const VIEWBOX_HEIGHT = 1000;
const MIN_REPEAT_COUNT = 8;

export default function CurvedLoop({
  marqueeText,
  speed = 1,
  curveAmount = 700,
  direction = "right",
  interactive = false,
  className = "",
}) {
  const pathId = useId().replace(/:/g, "");
  const pathRef = useRef(null);
  const textRef = useRef(null);
  const textPathRef = useRef(null);
  const animationFrameRef = useRef(null);
  const offsetRef = useRef(0);
  const dragRef = useRef(null);
  const [phraseWidth, setPhraseWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // 上方拱形路径：负 y 控制点让左上角形成更强的内收弧度。
  const pathD = `M-180,600 Q480,${600 - curveAmount} 1760,500`;
  const repeatedText = `${marqueeText}     `.repeat(MIN_REPEAT_COUNT);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => setReduceMotion(mediaQuery.matches);

    syncReducedMotion();
    mediaQuery.addEventListener("change", syncReducedMotion);
    return () => mediaQuery.removeEventListener("change", syncReducedMotion);
  }, []);

  useEffect(() => {
    if (!pathRef.current || !textRef.current) return undefined;

    const measure = () => {
      const width = textRef.current.getComputedTextLength() / MIN_REPEAT_COUNT;
      setPhraseWidth(width || 0);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(pathRef.current.ownerSVGElement);
    return () => resizeObserver.disconnect();
  }, [marqueeText]);

  useEffect(() => {
    if (reduceMotion || !phraseWidth || interactive) return undefined;

    let previousTime = performance.now();
    const movement = direction === "right" ? 1 : -1;

    const animate = (time) => {
      const delta = Math.min((time - previousTime) / 16.67, 3);
      previousTime = time;
      offsetRef.current = (offsetRef.current + movement * speed * delta) % phraseWidth;
      textPathRef.current?.setAttribute("startOffset", String(offsetRef.current - phraseWidth));
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [direction, interactive, phraseWidth, reduceMotion, speed]);

  const handlePointerDown = (event) => {
    if (!interactive || reduceMotion) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, offset: offsetRef.current };
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current || !phraseWidth) return;
    offsetRef.current = (dragRef.current.offset + event.clientX - dragRef.current.x) % phraseWidth;
    textPathRef.current?.setAttribute("startOffset", String(offsetRef.current - phraseWidth));
  };

  const handlePointerEnd = () => {
    dragRef.current = null;
  };

  const staticOffset = direction === "right" ? 0 : -phraseWidth;
  const displayOffset = reduceMotion ? staticOffset : offsetRef.current - phraseWidth;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 h-full w-full overflow-visible ${interactive ? "pointer-events-auto cursor-grab active:cursor-grabbing" : "pointer-events-none"} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <defs>
        <linearGradient id={`${pathId}-gradient`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5B6CF0" stopOpacity="0.92" />
          <stop offset="30%" stopColor="#7C3AED" stopOpacity="0.96" />
          <stop offset="58%" stopColor="#C026D3" stopOpacity="0.96" />
          <stop offset="78%" stopColor="#7C3AED" stopOpacity="0.96" />
          <stop offset="100%" stopColor="#5B6CF0" stopOpacity="0.92" />
        </linearGradient>
      </defs>
      <path ref={pathRef} id={pathId} d={pathD} fill="none" />
      <text
        ref={textRef}
        fill={`url(#${pathId}-gradient)`}
        className="select-none text-[34px] font-semibold tracking-[0.22em]"
        style={{ fontFamily: "Poppins, sans-serif" }}
      >
        <textPath ref={textPathRef} href={`#${pathId}`} startOffset={displayOffset}>
          {repeatedText}
        </textPath>
      </text>
    </svg>
  );
}
