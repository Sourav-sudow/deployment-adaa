import React, { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import LoginPage from "./components/LoginPage.tsx";
import AuthChoicePage from "./components/AuthChoicePage.tsx";
import {
  getCachedSession,
  getDefaultRouteForSession,
  getPendingSignupRole,
} from "./services/appSession.ts";

const LearningPage = lazy(() => import("./components/LearningPage.tsx"));
const ProfilePage = lazy(() => import("./components/ProfilePage.tsx"));
const OnboardingPage = lazy(() => import("./components/OnboardingPage.tsx"));
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

function HomeRoute() {
  const session = getCachedSession();
  if (session?.isAuthenticated) {
    return <Navigate to={getDefaultRouteForSession(session)} replace />;
  }

  return <AuthChoicePage />;
}

function ProtectedRoute({
  children,
  allowRole,
}: {
  children: React.ReactNode;
  allowRole?: "student" | "faculty";
}) {
  const session = getCachedSession();

  if (!session?.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!session.isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  if (allowRole && session.role !== allowRole) {
    return <Navigate to={getDefaultRouteForSession(session)} replace />;
  }

  return <>{children}</>;
}

function OnboardingRoute() {
  const session = getCachedSession();
  const pendingRole = getPendingSignupRole();

  if (!session?.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (session.isOnboarded) {
    return <Navigate to={getDefaultRouteForSession(session)} replace />;
  }

  if (!session.role && !pendingRole) {
    return <Navigate to="/signup" replace />;
  }

  return <OnboardingPage />;
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
            <Route path="/" element={<HomeRoute />} />
            <Route path="/login" element={<LoginPage mode="login" />} />
            <Route path="/signup" element={<LoginPage mode="signup" />} />
            <Route path="/share/:shareId" element={<SharedArtifactPage />} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route
              path="/learning"
              element={
                <ProtectedRoute allowRole="student">
                  <LearningPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/exam-week"
              element={
                <ProtectedRoute allowRole="student">
                  <ExamWeekPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/faculty"
              element={
                <ProtectedRoute allowRole="faculty">
                  <FacultyDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>
);
