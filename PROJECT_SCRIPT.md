# LERNO.AI - PROJECT SCRIPT & FULL DETAILS

## PROJECT OVERVIEW

**Project Name:** Lerno.ai - AI-Driven Personalized Learning Platform

**Tagline:** Revolutionizing ed-tech with AI-powered concept visualization and personalized learning experiences.

**Repository:** deployment-adaa

---

## 1. EXECUTIVE SUMMARY

Lerno.ai is a cutting-edge AI-powered educational platform that combines intelligent learning personalization with advanced visualization techniques to help students understand complex concepts better. The platform integrates AI tutors, interactive content, faculty dashboards, and gamification elements to create a comprehensive learning ecosystem.

---

## 2. KEY FEATURES

### 2.1 AI-Powered Learning
- **AI Chatbot (AIChatbot):** Real-time AI tutor providing personalized explanations and answers
- **AI Quiz Generation:** Automatic question generation using OpenRouter API
- **AI Study Planner:** Personalized study schedules based on student progress
- **SQL Tutor:** Specialized AI tutor for database learning
- **Topic Video Integration:** AI-curated video content from YouTube
- **Web LLM Support:** Client-side large language model capabilities

### 2.2 User Management & Authentication
- **Multi-role Authentication:**
  - Students
  - Faculty
  - Campus Administrators
- **Google Firebase:** Authentication and real-time database
- **Session Management:** User state tracking across the application
- **Profile Management:** User profile pages with progress tracking

### 2.3 Learning Modules
- **Topic Selection Page:** Browse and select learning topics
- **Year Selection:** Academic year-based content organization
- **Learning Page:** Main interactive learning interface with:
  - AI-powered explanations
  - Video recommendations
  - Interactive exercises
  - Progress tracking

### 2.4 Faculty & Admin Features
- **Faculty Dashboard:** 
  - Student performance monitoring
  - Class management
  - Content curation
  - Exam/Quiz creation
- **Campus Admin Tools:**
  - Campus content management
  - Student growth tracking
  - Faculty review system

### 2.5 Content Management
- **Campus Data System:** Organized course and topic structure
- **Content Packs:** Pre-built learning modules for different campuses
- **Syllabus Importer:** Bulk content import functionality
- **Topic Video Overrides:** Custom video assignments

### 2.6 Advanced Features
- **Activity Tracking:** Monitor user engagement and learning metrics
- **Artifact Sharing:** Share learning artifacts and notes
- **Text-to-Speech:** Audio narration for learning content (via ElevenLabs)
- **Animated UI Components:** Modern animations for better UX

---

## 3. TECHNICAL ARCHITECTURE

### 3.1 Frontend Stack

**Technology:** React 18.3 + TypeScript + Vite

**Key Dependencies:**
- **UI/Animation:**
  - Framer Motion (v12.5.0) - Advanced animations
  - Motion (v12.5.0) - Motion library
  - TailwindCSS (v4.0) - Styling and responsive design
  - Lucide React (v0.483) - Icon library
  - ldrs (v1.1.2) - Loading animations

- **AI & LLM:**
  - @mlc-ai/web-llm (v0.2.74) - Client-side LLM
  - @11labs/react (v0.1.0) - Text-to-speech integration
  - elevenlabs (v1.56.0) - Voice synthesis

- **Particle Effects:**
  - @tsparticles/react (v3.0.0)
  - tsparticles (v3.8.1)
  - simplex-noise (v4.0.3)

- **Backend Communication:**
  - Axios (v1.8.3) - HTTP client
  - CORS - Cross-origin support

- **Firebase:**
  - firebase (v11.5.0) - Authentication & database

- **Routing & State:**
  - React Router - Client-side routing
  - React DOM 18.3 - DOM rendering

**Component Structure:**
```
src/
├── components/
│   ├── AIChatbot.tsx - AI tutor chatbot interface
│   ├── AuthChoicePage.tsx - Role selection for signup
│   ├── ErrorPage.tsx - Error handling UI
│   ├── FacultyDashboardPage.tsx - Faculty admin tools
│   ├── LandingPage.tsx - Home page
│   ├── LearningPage.tsx - Main learning interface
│   ├── LoginPage.tsx - Authentication
│   ├── NavBar.tsx - Navigation component
│   ├── OnboardingPage.tsx - User onboarding flow
│   ├── ProfilePage.tsx - User profile management
│   ├── SettingsPage.tsx - User preferences
│   ├── SharedArtifactPage.tsx - Shared learning resources
│   ├── TopicSelectionPage.tsx - Course/topic browser
│   ├── YearSelectionPage.tsx - Academic year selection
│   └── UserMenu.tsx - User dropdown menu
├── ui/ - Reusable UI components (buttons, animations, backgrounds)
├── services/ - API calls & business logic
├── data/ - Static data and configurations
├── utils/ - Helper functions
└── ai/ - AI/LLM utilities
```

**Services:**
- `askTutor.ts` - AI tutor API integration
- `webllm.ts` - Web LLM client setup
- `activityTracker.ts` - User engagement tracking
- `apiBaseUrl.ts` - API configuration
- `appSession.ts` - Session management
- `campusAdmin.ts` - Campus administration
- `campusContent.ts` - Content management
- `campusData.ts` - Campus data structure
- `campusGrowth.ts` - Growth analytics
- `facultyReview.ts` - Faculty evaluation system
- `openRouterExamQuestions.ts` - Exam question generation
- `openRouterQuiz.ts` - Quiz API integration
- `openRouterTutor.ts` - AI tutor API (OpenRouter)
- `shareArtifacts.ts` - Artifact sharing functionality
- `studyPlanner.ts` - Personalized study scheduling
- `syllabusImporter.ts` - Bulk content import
- `topicVideoOverrides.ts` - Custom video management
- `youtubeVideos.ts` - YouTube integration

---

### 3.2 Backend Stack

**Node.js Server (server.js):**
- Express.js framework
- CORS middleware for cross-origin requests
- Serves frontend and API endpoints

**Python FastAPI Backend (main.py):**
- **Framework:** FastAPI (async, high-performance)
- **Database:** Google Firebase & Firestore
- **AI Integration:**
  - LangChain (Anthropic & Google)
  - Wikipedia API for knowledge retrieval
  - Custom campus data system

**Key Backend Features:**
- AI response generation using LangChain
- Firebase authentication and real-time updates
- Email notifications (SMTP integration)
- File uploads to Firebase Storage
- Campus-specific content management
- Quiz and exam generation
- User activity logging

**Python Dependencies:**
- `FastAPI` - Web framework
- `LangChain` - AI orchestration
- `firebase-admin` - Firebase integration
- `Anthropic` & `Google Cloud` - LLM APIs
- `pydantic` - Data validation
- `uvicorn` - ASGI server

---

## 4. USER FLOWS

### 4.1 Authentication Flow
1. User lands on Landing Page
2. Clicks "Login" or "Sign Up"
3. Selects role (Student/Faculty/Admin) on AuthChoicePage
4. Firebase authentication
5. Year selection (for students) → Campus selection
6. Redirected to appropriate dashboard

### 4.2 Student Learning Flow
1. Login → Select Year → Select Campus
2. Access LearningPage with topic selection
3. Interact with AI Chatbot for doubts
4. Generate quizzes and practice exercises
5. Track progress on ProfilePage
6. Share artifacts with peers

### 4.3 Faculty Workflow
1. Login as Faculty
2. Access FacultyDashboardPage
3. View student performance metrics
4. Create/manage assessments
5. Generate personalized study materials
6. Review student progress

---

## 5. API ENDPOINTS & INTEGRATIONS

### 5.1 External APIs Used
- **OpenRouter API** - AI model access
- **Google Firebase** - Auth & Database
- **Firebase Storage** - File storage
- **YouTube API** - Video content
- **ElevenLabs API** - Text-to-speech
- **Google Cloud Vision** - Image processing
- **Anthropic & Google Gemini** - LLM APIs

### 5.2 Backend Routes
- `/api/chat` - AI chatbot responses
- `/api/quiz` - Quiz generation
- `/api/study-plan` - Study schedule
- `/api/activity` - Activity tracking
- `/api/campus/*` - Campus management
- `/api/faculty/*` - Faculty operations
- `/api/share/*` - Artifact sharing

---

## 6. DATA STRUCTURE

### 6.1 User Document (Firestore)
```
{
  userId: string,
  name: string,
  email: string,
  role: "student" | "faculty" | "admin",
  campus: string,
  academicYear: number,
  courses: string[],
  progress: { [topicId]: number },
  activityLog: Activity[],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 6.2 Course/Topic Structure
```
{
  courseId: string,
  name: string,
  description: string,
  topics: Topic[],
  instructor: string,
  syllabus: string,
  resources: string[] // Video links, PDFs
}
```

### 6.3 Quiz/Assessment
```
{
  quizId: string,
  title: string,
  questions: Question[],
  difficulty: "easy" | "medium" | "hard",
  generatedBy: "ai" | "faculty",
  createdAt: timestamp,
  responses: Response[]
}
```

---

## 7. KEY TECHNOLOGIES & LIBRARIES

### Frontend Libraries
| Library | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI Framework |
| TypeScript | Latest | Type safety |
| Vite | Latest | Build tool |
| TailwindCSS | 4.0.14 | Styling |
| Framer Motion | 12.5.0 | Animations |
| Firebase | 11.5.0 | Auth & Database |
| Axios | 1.8.3 | HTTP requests |
| ElevenLabs | 1.56.0 | Text-to-speech |
| LucideReact | 0.483.0 | Icons |

### Backend Services
| Service | Purpose |
|---------|---------|
| FastAPI | Web framework |
| Firebase Admin SDK | Database & Auth |
| LangChain | AI orchestration |
| Anthropic API | LLM |
| Google Cloud | AI/Vision |
| Uvicorn | ASGI server |

---

## 8. SETUP & DEPLOYMENT

### Prerequisites
- Node.js v14+
- Python 3.8+
- Firebase project setup
- API keys (OpenRouter, ElevenLabs, etc.)

### Installation Steps

**1. Clone Repository**
```bash
git clone https://github.com/Sourav-sudow/deployment-adaa
cd deployment-adaa
```

**2. Frontend Setup**
```bash
npm install
```

**3. Backend Setup - Node**
```bash
cd backend
npm install
```

**4. Backend Setup - Python**
```bash
pip install -r requirements.txt
pip install -r requirements-manim.txt  # For animations
```

**5. Environment Configuration**
Create `.env` files:

**Root `.env`:**
```
VITE_API_BASE_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=your_key
# Other API keys
```

**Backend `.env`:**
```
ANTHROPIC_API_KEY=your_key
GEMINI_API_KEY=your_key
FIREBASE_STORAGE_BUCKET=your_bucket
OPENROUTER_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
```

### Running the Application

**Terminal 1 - Frontend:**
```bash
npm run dev
# Runs on http://localhost:5173
```

**Terminal 2 - Node Backend:**
```bash
cd backend
node server.js
# Runs on http://localhost:3000
```

**Terminal 3 - Python Backend:**
```bash
cd backend
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Build for Production
```bash
npm run build
# Creates optimized build in dist/
```

### Deployment (Vercel)
- Configuration in `vercel.json`
- Push to GitHub → Vercel automatically deploys

---

## 9. PROJECT WORKFLOW & FEATURES

### 9.1 Core User Journeys

**Student Journey:**
- Sign up → Select academic year & campus
- Browse topics and courses
- Interact with AI tutor for explanations
- Generate personalized quizzes
- Get AI-powered study plans
- Track progress and achievements
- Share learning artifacts

**Faculty Journey:**
- Create course syllabi and topics
- Define learning objectives
- Set up assessments
- Monitor student performance
- Generate progress reports
- Provide feedback and guidance

**Admin Journey:**
- Manage campus data
- Configure content packs
- Monitor platform growth
- Review faculty performance
- Manage system settings

### 9.2 Unique Features
1. **AI Concept Visualization** - Complex concepts explained via AI
2. **Personalized Learning Paths** - Dynamic study schedules
3. **Real-time Collaboration** - Share notes and artifacts
4. **Voice Learning** - Text-to-speech for accessibility
5. **Campus-specific Content** - Tailored for different institutions
6. **Faculty Oversight** - Educator dashboard and tools
7. **Growth Analytics** - Track institutional growth metrics

---

## 10. PROJECT GOALS & IMPACT

### Educational Impact
- ✅ Enhance student understanding through AI explanations
- ✅ Reduce learning time with personalized paths
- ✅ Improve accessibility with multi-modal learning (text, video, audio)
- ✅ Support faculty with data-driven insights
- ✅ Scale quality education across institutions

### Technical Goals
- ✅ Real-time, responsive UI with modern animations
- ✅ Scalable backend architecture
- ✅ Secure authentication and data management
- ✅ Integration with cutting-edge AI APIs
- ✅ Mobile-responsive and accessible platform

---

## 11. FILE STRUCTURE SUMMARY

```
lerno-ai/
├── public/                 # Static assets
├── src/
│   ├── ai/                # AI utilities
│   ├── assets/            # Images, fonts
│   ├── components/        # React components
│   ├── data/              # Static data
│   ├── lib/               # Libraries
│   ├── services/          # API & business logic
│   ├── ui/                # UI component library
│   ├── utils/             # Helper functions
│   ├── App.tsx            # Root component
│   ├── main.tsx           # React entry point
│   └── App.css            # Global styles
├── backend/
│   ├── main.py            # FastAPI backend
│   ├── server.js          # Node.js express server
│   ├── campus_data.py     # Campus data management
│   ├── requirements.txt    # Python dependencies
│   └── __pycache__/
├── data/                  # Data files (JSON)
├── package.json           # Node dependencies
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript config
└── vercel.json            # Deployment config
```

---

## 12. PERFORMANCE & OPTIMIZATION

- **Frontend Optimization:**
  - Lazy loading of components
  - Code splitting with Vite
  - Optimized bundle size
  - Image optimization

- **Backend Optimization:**
  - Async processing with FastAPI
  - Caching strategies
  - Database indexing
  - API response optimization

---

## 13. SECURITY MEASURES

- ✅ Firebase Authentication (secure token management)
- ✅ CORS configuration (prevent unauthorized requests)
- ✅ Environment variables for sensitive data
- ✅ API key protection
- ✅ Role-based access control (RBAC)

---

## 14. FUTURE ENHANCEMENTS

- 🚀 Mobile app (React Native)
- 🚀 Advanced analytics dashboard
- 🚀 Social learning features
- 🚀 Gamification elements expansion
- 🚀 Offline mode support
- 🚀 Multi-language support
- 🚀 Advanced recommendation engine

---

## 15. TEAM & CREDITS

**Project:** Lerno.ai - HackoWasp 7.0 (Ctrl Alt Defeat Team)

**Repository:** https://github.com/Sourav-sudow/deployment-adaa

**Key Technologies:** React, TypeScript, FastAPI, Firebase, AI/LLM APIs

---

**Last Updated:** April 2026  
**Status:** Active Development & Deployment
