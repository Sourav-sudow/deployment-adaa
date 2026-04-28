import React, { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

const LearningPage = lazy(() => import("./components/LearningPage.tsx"));
const ProfilePage = lazy(() => import("./components/ProfilePage.tsx"));
const FacultyDashboardPage = lazy(() => import("./components/FacultyDashboardPage.tsx"));
const SharedArtifactPage = lazy(() => import("./components/SharedArtifactPage.tsx"));
const ExamWeekPage = lazy(() => import("./components/ExamWeekPage.tsx"));

function LearningFallback() {
  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center text-white">
      <p className="text-lg">Loading learning space…</p>
    </div>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            background: "#111",
            color: "#fafafa",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>App error (check console too)</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.9 }}>
            {this.state.err.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LearningFallback />}>
          <Routes>
            <Route path="/" element={<LearningPage />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />
            <Route path="/share/:shareId" element={<SharedArtifactPage />} />
            <Route path="/onboarding" element={<Navigate to="/" replace />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/exam-week" element={<ExamWeekPage />} />
            <Route path="/faculty" element={<FacultyDashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>
);
