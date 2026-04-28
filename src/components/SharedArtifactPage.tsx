import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchShareArtifact, type ShareArtifact } from "../services/shareArtifacts";
import { getCachedSession } from "../services/appSession";

function formatDate(timestamp: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export default function SharedArtifactPage() {
  const { shareId = "" } = useParams();
  const navigate = useNavigate();
  const session = useMemo(() => getCachedSession(), []);
  const [artifact, setArtifact] = useState<ShareArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchShareArtifact(shareId)
      .then((data) => {
        if (active) {
          setArtifact(data.shareArtifact);
        }
      })
      .catch((err) => {
        if (active) {
          setError((err as Error).message || "Failed to load shared artifact.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [shareId]);

  const openRoute = artifact
    ? `/learning?topic=${encodeURIComponent(artifact.topicTitle)}`
    : "/learning";
  const signupRoute = artifact
    ? `/signup?university=${encodeURIComponent(artifact.universityId)}${
        artifact.referralCode ? `&ref=${encodeURIComponent(artifact.referralCode)}` : ""
      }`
    : "/signup";

  const primaryAction = () => {
    if (session?.isAuthenticated && session.isOnboarded && session.role === "student") {
      navigate(openRoute);
      return;
    }
    navigate(signupRoute);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(21,24,54,0.98),_rgba(4,8,24,1))] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.9)] backdrop-blur-2xl md:p-8">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-10 text-center text-white/65">
              Loading shared study artifact...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-5 py-10 text-center text-rose-200">
              {error}
            </div>
          ) : artifact ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                    Public Study Share
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold">{artifact.shareTitle || artifact.topicTitle}</h1>
                  <p className="mt-3 max-w-2xl text-sm text-white/70">
                    {artifact.shareText || artifact.payload.summary || artifact.payload.narration || "Open this shared revision artifact on Lerno."}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/65">
                  <p>{artifact.universityName || "Campus share"}</p>
                  <p className="mt-1">{artifact.subjectTitle || artifact.topicTitle}</p>
                  <p className="mt-1">{formatDate(artifact.createdAt)}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/45">Topic</p>
                  <p className="mt-3 text-xl font-semibold">{artifact.topicTitle}</p>
                  {artifact.unitTitle ? <p className="mt-2 text-sm text-white/60">{artifact.unitTitle}</p> : null}
                  {artifact.subjectTitle ? <p className="mt-1 text-sm text-white/60">{artifact.subjectTitle}</p> : null}
                </div>

                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-500/15 to-cyan-500/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/45">What you can do</p>
                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    <p>Read a quick explainer.</p>
                    <p>Pick up exam-relevant notes.</p>
                    <p>Jump into the full learning flow on Lerno.</p>
                  </div>
                </div>
              </div>

              {artifact.payload.notes.length ? (
                <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Revision Notes</h2>
                    <span className="text-xs uppercase tracking-[0.22em] text-white/45">
                      {artifact.payload.notes.length} notes
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {artifact.payload.notes.map((note) => (
                      <div key={note} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
                        {note}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {artifact.payload.narration ? (
                <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="text-lg font-semibold">Explainer</h2>
                  <p className="mt-4 text-sm leading-7 text-white/75">{artifact.payload.narration}</p>
                </section>
              ) : null}

              {(artifact.payload.fiveMarkQuestions.length || artifact.payload.tenMarkQuestions.length) ? (
                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <h2 className="text-lg font-semibold">5 Mark Questions</h2>
                    <div className="mt-4 space-y-3">
                      {artifact.payload.fiveMarkQuestions.map((question) => (
                        <div key={question} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
                          {question}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <h2 className="text-lg font-semibold">10 Mark Questions</h2>
                    <div className="mt-4 space-y-3">
                      {artifact.payload.tenMarkQuestions.map((question) => (
                        <div key={question} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75">
                          {question}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={primaryAction}
                  className="rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  {session?.isAuthenticated && session.isOnboarded ? "Open in Lerno" : "Join Campus and Open"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06]"
                >
                  Go Home
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
