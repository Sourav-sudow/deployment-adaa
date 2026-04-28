import { useNavigate } from "react-router-dom";
import { SparklesCore } from "../ui/sparkles";
import { coursesData, Course } from "../data/coursesData";
import UserMenu from "./UserMenu";

export default function YearSelectionPage() {
  const navigate = useNavigate();
  const selectedCourse = localStorage.getItem("selectedCourse") as Course;

  if (!selectedCourse || !coursesData[selectedCourse]) {
    navigate("/courses");
    return null;
  }

  const courseData = coursesData[selectedCourse];
  const years = Object.keys(courseData.years);

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

  const handleYearSelect = (year: string) => {
    localStorage.setItem("selectedYear", year);
    navigate("/subjects");
  };

  const handleBack = () => {
    navigate("/courses");
  };

  return (
    <div className="min-h-screen relative w-full bg-black overflow-hidden">
      <div className="absolute inset-0 h-full w-full">
        <SparklesCore
          id="tsparticles-year"
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
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition duration-300"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-white">
              {selectedCourse} - Select Year
            </h1>
          </div>
          <UserMenu onLogout={handleLogout} />
        </div>

        {/* Years Grid */}
        <div className="px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
            {years.map((year) => (
              <button
                key={year}
                onClick={() => handleYearSelect(year)}
                className="group h-40 bg-gradient-to-br from-green-900/40 to-teal-900/40 hover:from-green-800/60 hover:to-teal-800/60 border border-green-700/50 hover:border-teal-500/50 rounded-xl p-8 transition duration-300 flex flex-col justify-center items-center"
              >
                <h2 className="text-3xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-green-400 group-hover:to-teal-400">
                  {year}
                </h2>
                <p className="text-sm text-gray-500 group-hover:text-green-400">
                  {Object.keys(coursesData[selectedCourse].years[year as keyof typeof courseData.years].subjects).length} Subjects
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
