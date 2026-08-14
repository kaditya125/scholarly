import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, PhoneOff } from 'lucide-react';
import { useSessionJoinInfo, useClassSessionMutations } from '../hooks/api/useClassSessions';

/**
 * /classes/:classId/sessions/:sessionId/join — the actual live call, full-screen and isolated
 * like /quiz/attempts/:attemptId.
 *
 * The iframe embeds 100ms's own hosted Prebuilt room UI directly
 * (https://<subdomain>.app.100ms.live/meeting/<code>) — no client-side video SDK is installed in
 * this frontend. That was a deliberate choice this pass: adding 100ms's React SDK pulled in a
 * peer-dependency conflict with this app's React 19, and a dry-run showed it would remove ~245
 * packages this app actually depends on (antd, date-fns, and others) to resolve it. The iframe
 * approach gets a fully working call UI (video tiles, mute, screen share, chat) with zero new
 * frontend dependencies; a custom-built call UI using the SDK is a real option later once that
 * peer-dependency conflict is worth resolving on its own.
 */
export default function ClassSessionJoin() {
  const { classId, sessionId } = useParams<{ classId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useSessionJoinInfo(classId, sessionId);
  const { end } = useClassSessionMutations(classId as string);
  const [ending, setEnding] = useState(false);

  const leave = () => navigate(-1);

  const endForEveryone = async () => {
    if (!sessionId) return;
    setEnding(true);
    try {
      await end.mutateAsync(sessionId);
      navigate(-1);
    } catch {
      setEnding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as any)?.response?.data?.error ?? 'This session is not available.';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
        <AlertTriangle className="w-6 h-6 text-slate-400" aria-hidden />
        <p className="text-[14px] text-slate-300">{msg}</p>
        <button onClick={leave} className="text-[13.5px] font-semibold text-white underline underline-offset-2">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-white/10">
        <button onClick={leave} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-300 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={2} aria-hidden />
          Leave
        </button>
        <p className="flex-1 min-w-0 text-[13.5px] font-medium text-white truncate text-center">{data.title}</p>
        {data.role === 'teacher' ? (
          <button
            onClick={endForEveryone}
            disabled={ending}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-semibold disabled:opacity-60"
          >
            {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <PhoneOff className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />}
            End for everyone
          </button>
        ) : (
          <span className="w-[6.5rem]" />
        )}
      </header>

      <iframe
        src={data.joinUrl}
        title={data.title}
        allow="camera; microphone; display-capture; fullscreen; autoplay"
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
