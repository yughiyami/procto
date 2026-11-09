/**
 * Five threads (coordinator, buyer, two workshops, investor) that light up one by one and
 * meet in the gold knot as the demo gets ready. It is the same idea as the brand mark.
 */
const STARTS = [20, 90, 160, 230, 300];

export function DemoThreads({ progress, failed }: { progress: number; failed: boolean }) {
  const lit = Math.min(STARTS.length, Math.floor(progress * STARTS.length + 0.0001));
  const complete = progress >= 1;
  return (
    <svg className="threads" viewBox="0 0 320 120" aria-hidden="true" data-complete={complete || undefined} data-failed={failed || undefined}>
      {STARTS.map((x, i) => (
        <path
          key={x}
          className="threads__line"
          data-lit={i < lit || undefined}
          d={`M${x} 6 C${x} 62 160 52 160 92`}
          pathLength={1}
        />
      ))}
      {STARTS.map((x, i) => (
        <circle key={`d${x}`} className="threads__dot" data-lit={i < lit || undefined} cx={x} cy={6} r={4.5} />
      ))}
      <circle className="threads__knot" cx={160} cy={96} r={9} />
    </svg>
  );
}
