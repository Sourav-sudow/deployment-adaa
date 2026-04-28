import { useNavigate } from "react-router-dom";
import { SparklesCore } from "../ui/sparkles";
import { coursesData, Course } from "../data/coursesData";
import UserMenu from "./UserMenu";

type TopicEntry = string | { title: string; videoUrl?: string; narration?: string };

export default function TopicSelectionPage() {
  const navigate = useNavigate();
  const selectedCourse = localStorage.getItem("selectedCourse") as Course;
  const selectedYear = localStorage.getItem("selectedYear");
  const selectedSubject = localStorage.getItem("selectedSubject");
  const courseData = coursesData[selectedCourse];

  if (!courseData || !selectedYear || !selectedSubject) {
    navigate("/courses");
    return null;
  }

  const yearData = courseData.years[selectedYear as keyof typeof courseData.years];
  const subjectKey = selectedSubject as keyof NonNullable<typeof yearData>["subjects"];
  const rawSubject = yearData?.subjects[subjectKey];

  if (
    !yearData ||
    !rawSubject ||
    typeof rawSubject !== "object" ||
    !("topics" in rawSubject)
  ) {
    navigate("/subjects");
    return null;
  }

  const subjectData = rawSubject as { name: string; topics: TopicEntry[] };

  const handleTopicSelect = (topic: TopicEntry) => {
    const title = typeof topic === "string" ? topic : topic.title;
    const videoUrl = typeof topic === "string" ? "" : topic.videoUrl || "";
    const narration = typeof topic === "string" ? "" : topic.narration || "";
    localStorage.setItem("selectedTopic", title);
    localStorage.setItem("selectedTopicTitle", title);
    if (videoUrl) {
      localStorage.setItem("selectedTopicVideoUrl", videoUrl);
    } else {
      localStorage.removeItem("selectedTopicVideoUrl");
    }
    if (narration) {
      localStorage.setItem("selectedTopicNarration", narration);
    } else {
      localStorage.removeItem("selectedTopicNarration");
    }
    navigate("/learning");
  };

  const handleLogout = () => {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userName");
    localStorage.removeItem("userAvatar");
    localStorage.removeItem("userPhone");
    localStorage.removeItem("selectedCourse");
    localStorage.removeItem("selectedYear");
    localStorage.removeItem("selectedSubject");
    localStorage.removeItem("selectedTopic");
    navigate("/login");
  };

  const handleBack = () => {
    navigate("/subjects");
  };

  return (
    <div className="min-h-screen relative w-full bg-black overflow-hidden">
      <div className="absolute inset-0 h-full w-full">
        <SparklesCore
          id="tsparticles-topics"
          background="transparent"
          minSize={0.6}
          maxSize={1.4}
          particleDensity={100}
          className="w-full h-full"
          particleColor="#FFFFFF"
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center p-8">
          <div>
            <button
              onClick={handleBack}
              className="text-green-400 hover:text-green-300 mb-2 transition"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-white">
              {selectedSubject} - Select Topic
            </h1>
            <p className="text-gray-400 mt-1">
              {selectedCourse} / {selectedYear} / {subjectData.name}
            </p>
          </div>
          <UserMenu onLogout={handleLogout} />
        </div>

        {/* Topics List */}
        <div className="px-8 py-12">
          <div className="max-w-2xl space-y-4">
            {(subjectData.topics as TopicEntry[]).map((topic, index) => {
              const title = typeof topic === "string" ? topic : topic.title;
              return (
                <button
                  key={title}
                  onClick={() => handleTopicSelect(topic)}
                  className="w-full group relative overflow-hidden rounded-xl p-6 bg-gradient-to-r from-orange-900/40 to-red-900/40 hover:from-orange-800/60 hover:to-red-800/60 border border-orange-700/50 hover:border-red-500/50 transition duration-300 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <span className="text-xl font-bold text-orange-400 group-hover:text-orange-300">
                          {index + 1}.
                        </span>
                        <h3 className="text-2xl font-semibold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-orange-400 group-hover:to-red-400">
                          {title}
                        </h3>
                      </div>
                      <p className="text-gray-400 group-hover:text-gray-300 text-sm ml-12">
                        Learn about {title.toLowerCase()}
                      </p>
                    </div>
                    <span className="text-2xl group-hover:translate-x-2 transition duration-300">
                      →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
