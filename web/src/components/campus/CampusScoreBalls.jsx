import { LiquidLoader } from "../Primitives.jsx";

export default function CampusScoreBalls({ matches, className = "" }) {
  if (!matches?.length) return null;
  return (
    <div className={`flex max-w-full min-w-0 items-start gap-2 overflow-x-auto pb-1 ${className}`} aria-label="岗位匹配度">
      {matches.map((match) => (
        <div key={match.jobId} className="flex w-16 shrink-0 flex-col items-center" title={match.title}>
          {match.scoreShown == null ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm text-gray-400">—</span>
          ) : (
            <LiquidLoader size={40} level={match.scoreShown} label={match.scoreShown} instant />
          )}
          <span className="mt-1 w-full break-all text-center text-[10px] leading-3 text-gray-600 line-clamp-2">{match.title}</span>
        </div>
      ))}
    </div>
  );
}
