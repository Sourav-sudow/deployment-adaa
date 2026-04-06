import json
import re
import os
from typing import Any, Dict, List, Literal, Optional
from dotenv import load_dotenv

from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from google.api_core import exceptions as gcloud_exceptions
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import PromptTemplate
from langchain_community.utilities import WikipediaAPIWrapper
import subprocess
import firebase_admin
from firebase_admin import credentials, storage, firestore
import uuid
import random
import smtplib
import time
from email.mime.text import MIMEText

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FIREBASE_CRED_FILENAME = "lerno-cd286-firebase-adminsdk-fbsvc-222d396b1f.json"
DEFAULT_FIREBASE_STORAGE_BUCKET = "lerno-cd286.firebasestorage.app"

# Always load backend/.env explicitly and override any stale shell values.
env_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path, override=True)

# Also load .env.local if it exists (Vite often uses .env.local for dev keys)
local_env = os.path.join(BASE_DIR, ".env.local")
if os.path.exists(local_env):
    load_dotenv(local_env, override=True)

bucket = None
try:
    firebase_storage_bucket = (
        os.getenv("FIREBASE_STORAGE_BUCKET")
        or DEFAULT_FIREBASE_STORAGE_BUCKET
    ).strip()
    firebase_cred_path = (
        os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        or os.path.join(BASE_DIR, DEFAULT_FIREBASE_CRED_FILENAME)
    ).strip()
    firebase_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    firebase_private_key_id = os.getenv("FIREBASE_PRIVATE_KEY_ID", "").strip()
    firebase_private_key = os.getenv("FIREBASE_PRIVATE_KEY", "")
    firebase_client_email = os.getenv("FIREBASE_CLIENT_EMAIL", "").strip()
    firebase_client_id = os.getenv("FIREBASE_CLIENT_ID", "").strip()

    cred = None
    cred_source = None

    if firebase_json:
        try:
            cred = credentials.Certificate(json.loads(firebase_json))
            cred_source = "FIREBASE_SERVICE_ACCOUNT_JSON"
        except Exception as e:
            print(f"Firebase JSON from env is invalid: {e}")
            raise
    elif firebase_project_id and firebase_private_key and firebase_client_email:
        try:
            cred = credentials.Certificate(
                {
                    "type": "service_account",
                    "project_id": firebase_project_id,
                    "private_key_id": firebase_private_key_id,
                    "private_key": firebase_private_key.replace("\\n", "\n"),
                    "client_email": firebase_client_email,
                    "client_id": firebase_client_id,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_x509_cert_url": "",
                }
            )
            cred_source = "split FIREBASE_* env vars"
        except Exception as e:
            print(f"Firebase credentials from split env vars are invalid: {e}")
            raise
    elif firebase_cred_path and os.path.exists(firebase_cred_path):
        try:
            with open(firebase_cred_path, "r", encoding="utf-8") as jf:
                json.load(jf)
        except Exception as e:
            print(f"Firebase credential file is present but invalid JSON: {e}")
            raise

        cred = credentials.Certificate(firebase_cred_path)
        cred_source = firebase_cred_path

    if cred is not None:
        try:
            firebase_admin.initialize_app(
                cred,
                {"storageBucket": firebase_storage_bucket} if firebase_storage_bucket else None,
            )
            bucket = storage.bucket() if firebase_storage_bucket else None
            print(f"Firebase initialized using {cred_source}.")
        except Exception as e:
            print(f"Failed to initialize Firebase SDK: {e}")
            bucket = None
    else:
        print(
            "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_PATH, "
            "FIREBASE_SERVICE_ACCOUNT_JSON, or split FIREBASE_* env vars to enable Firestore."
        )
        bucket = None
except Exception:
    # Any error above should not prevent the backend from starting — continue without Firebase
    bucket = None

anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
google_api_key = os.getenv("GOOGLE_API_KEY")
model = None

gemini_model = None
use_gemini = bool(google_api_key)

if not anthropic_api_key:
    print(
        "ANTHROPIC_API_KEY not found. Claude-powered content generation will be unavailable, "
        "but the rest of the API can still start."
    )


def get_gemini_model():
    global gemini_model, use_gemini

    if not google_api_key:
        return None

    if gemini_model is not None:
        return gemini_model

    try:
        from langchain_google_genai import ChatGoogleGenerativeAI

        gemini_model = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=google_api_key,
        )
        return gemini_model
    except (ImportError, Exception) as e:
        print(f"Failed to initialize Gemini: {e}")
        print("Will use Claude for classification instead.")
        use_gemini = False
        return None


def get_claude_model():
    global model

    if model is not None:
        return model

    if not anthropic_api_key:
        return None

    model = ChatAnthropic(
        model_name="claude-3-7-sonnet-20250219",
        anthropic_api_key=anthropic_api_key,
        temperature=0.7,
        max_tokens=4000,
    )
    return model

wikipedia = WikipediaAPIWrapper(top_k_results=2)

STORYBOARD_PROMPT_TEMPLATE = PromptTemplate(
    input_variables=["audience", "topic", "wikipedia_info"],
    template="""For an audience of a {audience}, generate a series of 3 frames to explain {topic}. Each frame should be a single animation point, such as visualizing squaring a number visually or adding a vector tip to tail. It should not take longer than 15 seconds.
    Also use this wikipedia information to help create the frames {wikipedia_info}, but it is not necessary only for reference.

For example, explaining vector addition would be:
1. Frame showing 2 vectors from the origin explaining that these can be any arbitrary vector.
2. Showing vector addition numerically, adding each component numerically.
3. Explain a simple practical example of vector addition, how 2 forces can combine together into a larger force.

Do not include a frame for a quiz.

Each frame should come with a short description of what it will talk about. This is meant to be the storyboard for an animated video explaining this concept.

Format the frames in the following JSON format:

{{ "frames": 
[
{{
"title": "xxxx",
"description": "xxxx"
}},
{{
"title": "xxxx",
"description": "xxxx"
}},
{{
"title": "xxxx",
"description": "xxxx"
}}
]
}}

Ensure that the JSON is valid.

The title should be short, limit of 5 words.
The description should be a few sentences, enough for someone to understand what to do and how to animate and explain this frame.

Output only the plaintext JSON format of the frames. DO NOT OUTPUT MARKDOWN. DO NOT INCLUDE A PREAMBLE OR POSTAMBLE."""
)

SCENE_AGENT_PROMPT_TEMPLATE = PromptTemplate(
    input_variables=["frame"],
    template="""Given the following, generate a script and animation description in the style of 3Blue1Brown.

{frame}

The script will be read orally to the student. This should not take longer than 10-15 seconds.
The animation description should be descriptive of what should be shown on the screen along with relevant positional information. (e.g., The number line should be centered vertically on the screen with a range of -10 to 10 with ticks for every 0.2, there is a blue arrow above the number line pointing from 0 to +5. The arrow will then shrink until it points to +2.)

IMPORTANT: Do NOT include ANY REFERENCE to 'scale_tips' parameter in the animation description, as this parameter is not supported in Manim CE 0.19.0.

In addition, generate a 4-choice multiple-choice question and a free-response question that can be asked at the end of the video.

Instead of always putting the correct answer first in the multiple-choice array, randomly place it at any position, and then specify which index (0, 1, 2, or 3) contains the correct answer in the "correct-index" field.

The answer for the free response should be a string.

Return the data in the following format:

{{
"narration": "string",
"animation-description": "string",
"free-response-question": "string",
"free-response-answer": "string",
"multiple-choice-question": "string",
"multiple-choice-choices": ["choice1 - string", "choice2 - string", "choice3 - string", "choice4 - string"],
"correct-index": integer (0-3)
}}

THE RESPONSE SHOULD ONLY BE A VALID PLAINTEXT JSON FORMAT. DO NOT OUTPUT MARKDOWN. DO NOT INCLUDE A PREAMBLE OR POSTAMBLE."""
)

EXAMPLE_CODE = r'''
from manim import *

class IntroductionToVector(Scene):
    def construct(self):
        axes = Axes(
            x_range=[-5, 5, 1], y_range=[-3, 3, 1],
            axis_config={"color": BLUE}
        )
        
        vector = Arrow(ORIGIN, [2, 1, 0], buff=0, color=YELLOW)
        vector_label = MathTex(r"\vec{{v}} = (2,1)").next_to(vector, UP)
        
        x_component = DashedLine(start=ORIGIN, end=[2, 0, 0], color=RED)
        y_component = DashedLine(start=[2, 0, 0], end=[2, 1, 0], color=GREEN)
        
        x_label = MathTex("2").next_to(x_component, DOWN)
        y_label = MathTex("1").next_to(y_component, RIGHT)
        
        self.play(Create(axes))
        self.play(GrowArrow(vector), Write(vector_label))
        self.play(Create(x_component), Write(x_label))
        self.play(Create(y_component), Write(y_label))
        
        self.wait(2)
        
        vector2 = Arrow([2, 1, 0], [4, 3, 0], buff=0, color=ORANGE)
        vector2_label = MathTex(r"\vec{{w}} = (2,2)").next_to(vector2, UP)
        
        result_vector = Arrow(ORIGIN, [4, 3, 0], buff=0, color=PURPLE)
        result_label = MathTex(r"\vec{{v}} + \vec{{w}} = (4,3)").next_to(result_vector, UP)
        
        self.play(GrowArrow(vector2), Write(vector2_label))
        self.wait(1)
        self.play(GrowArrow(result_vector), Write(result_label))
        
        self.wait(2)
'''

OTP_EXPIRY_SECONDS = 300
otp_store = {}


def get_firestore_db():
    try:
        if firebase_admin._apps:
            return firestore.client()
    except Exception:
        return None
    return None


def now_ms() -> int:
    return int(time.time() * 1000)


def user_doc_id(email: str) -> str:
    return normalize_email(email)


def default_avatar(email: str) -> str:
    return f"https://api.dicebear.com/7.x/notionists-neutral/svg?seed={email}"


def sanitize_topic_list(items: Any) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []

    sanitized = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        sanitized.append(
            {
                "title": title,
                "videoUrl": str(item.get("videoUrl", "")).strip(),
                "narration": str(item.get("narration", "")).strip(),
                "subjectTitle": str(item.get("subjectTitle", "")).strip(),
                "unitTitle": str(item.get("unitTitle", "")).strip(),
                "unitTopics": [
                    str(topic).strip()
                    for topic in item.get("unitTopics", [])
                    if str(topic).strip()
                ]
                if isinstance(item.get("unitTopics"), list)
                else [],
                "lastVisitedAt": int(item.get("lastVisitedAt", now_ms())),
            }
        )
    return sanitized


def sanitize_current_selection(selection: Any) -> Dict[str, Any]:
    if not isinstance(selection, dict):
        return {
            "title": "",
            "videoUrl": "",
            "narration": "",
            "subjectTitle": "",
            "unitTitle": "",
            "unitTopics": [],
        }

    return {
        "title": str(selection.get("title", "")).strip(),
        "videoUrl": str(selection.get("videoUrl", "")).strip(),
        "narration": str(selection.get("narration", "")).strip(),
        "subjectTitle": str(selection.get("subjectTitle", "")).strip(),
        "unitTitle": str(selection.get("unitTitle", "")).strip(),
        "unitTopics": [
            str(topic).strip()
            for topic in selection.get("unitTopics", [])
            if str(topic).strip()
        ]
        if isinstance(selection.get("unitTopics"), list)
        else [],
    }


def default_preferences() -> Dict[str, Any]:
    return {"theme": "dark", "sidebarCollapsed": False, "updatedAt": now_ms()}


def default_learning_state() -> Dict[str, Any]:
    return {
        "recentTopics": [],
        "bookmarkedTopics": [],
        "currentSelection": sanitize_current_selection({}),
        "updatedAt": now_ms(),
    }


def topic_override_doc_id(subject_title: str, unit_title: str, topic_title: str) -> str:
    key = "||".join(
        [
            (subject_title or "").strip().lower(),
            (unit_title or "").strip().lower(),
            (topic_title or "").strip().lower(),
        ]
    )
    return re.sub(r"[^a-z0-9|_-]+", "-", key)


def ensure_firestore():
    db = get_firestore_db()
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Firestore is not configured. Please verify Firebase admin setup.",
        )
    return db


def firestore_error_detail(exc: Exception) -> str:
    if isinstance(exc, gcloud_exceptions.PermissionDenied):
        return (
            "Cloud Firestore API is disabled for this Firebase project. "
            "Enable Firestore API in Google Cloud Console, wait 2-5 minutes, then retry onboarding."
        )
    if isinstance(exc, gcloud_exceptions.FailedPrecondition):
        return (
            "Cloud Firestore is not initialized for this project yet. "
            "Create the Firestore database in Firebase Console and retry."
        )
    if isinstance(exc, gcloud_exceptions.GoogleAPICallError):
        return f"Firestore request failed: {exc}"
    return "Firestore request failed."


def firestore_guard(operation):
    try:
        return operation()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=firestore_error_detail(exc)) from exc


def serialize_user(user_data: Optional[Dict[str, Any]], email: str):
    if not user_data:
        return None

    normalized_email = normalize_email(email)
    role = user_data.get("role")

    return {
        "uid": user_data.get("uid") or user_doc_id(normalized_email),
        "email": normalized_email,
        "role": role,
        "fullName": user_data.get("fullName") or normalized_email.split("@")[0],
        "phone": user_data.get("phone") or "",
        "avatar": user_data.get("avatar") or default_avatar(normalized_email),
        "isOnboarded": bool(user_data.get("isOnboarded")),
        "course": user_data.get("course") or "",
        "year": user_data.get("year") or "",
        "semester": user_data.get("semester") or "",
        "department": user_data.get("department") or "",
        "designation": user_data.get("designation") or "",
        "createdAt": int(user_data.get("createdAt", now_ms())),
        "updatedAt": int(user_data.get("updatedAt", now_ms())),
    }


def build_session_payload(email: str):
    normalized_email = normalize_email(email)
    db = ensure_firestore()
    doc_id = user_doc_id(normalized_email)

    def run():
        user_doc = db.collection("users").document(doc_id).get()
        user_data = user_doc.to_dict() if user_doc.exists else None

        preferences_doc = db.collection("user_preferences").document(doc_id).get()
        preferences_data = preferences_doc.to_dict() if preferences_doc.exists else {}
        preferences = default_preferences()
        preferences.update(
            {
                "theme": preferences_data.get("theme") or "dark",
                "sidebarCollapsed": bool(preferences_data.get("sidebarCollapsed")),
                "updatedAt": int(preferences_data.get("updatedAt", preferences["updatedAt"])),
            }
        )

        learning_doc = db.collection("learning_sessions").document(doc_id).get()
        learning_data = learning_doc.to_dict() if learning_doc.exists else {}
        learning_state = default_learning_state()
        learning_state.update(
            {
                "recentTopics": sanitize_topic_list(learning_data.get("recentTopics", [])),
                "bookmarkedTopics": sanitize_topic_list(
                    learning_data.get("bookmarkedTopics", [])
                ),
                "currentSelection": sanitize_current_selection(
                    learning_data.get("currentSelection", {})
                ),
                "updatedAt": int(learning_data.get("updatedAt", learning_state["updatedAt"])),
            }
        )

        serialized_user = serialize_user(user_data, normalized_email)

        return {
            "isAuthenticated": True,
            "email": normalized_email,
            "exists": bool(user_data),
            "isOnboarded": bool(serialized_user and serialized_user.get("isOnboarded")),
            "role": serialized_user.get("role") if serialized_user else None,
            "profile": serialized_user,
            "preferences": preferences,
            "learningState": learning_state,
        }

    return firestore_guard(run)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def is_valid_college_email(email: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._%+-]+@krmu\.edu\.in", normalize_email(email)))


def generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def send_otp_email(recipient_email: str, otp: str) -> bool:
    email_host = os.getenv("EMAIL_HOST")
    email_port = int(os.getenv("EMAIL_PORT", "587"))
    email_user = os.getenv("EMAIL_HOST_USER")
    email_password = os.getenv("EMAIL_HOST_PASSWORD")
    email_from = os.getenv("EMAIL_FROM") or email_user

    if not all([email_host, email_user, email_password, email_from]):
        print(f"[OTP DEMO] Email config missing. OTP for {recipient_email}: {otp}")
        return False

    message = MIMEText(
        f"""Your Lerno.ai verification code is: {otp}

This OTP will expire in 5 minutes.

If you did not request this code, you can ignore this email.""",
        "plain",
        "utf-8",
    )
    message["Subject"] = "Lerno.ai Login OTP"
    message["From"] = email_from
    message["To"] = recipient_email

    try:
        if email_port == 465:
            with smtplib.SMTP_SSL(email_host, email_port) as server:
                server.login(email_user, email_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(email_host, email_port) as server:
                server.starttls()
                server.login(email_user, email_password)
                server.send_message(message)

        print(f"OTP email sent successfully to {recipient_email}")
        return True
    except Exception as exc:
        print(f"[OTP ERROR] Failed to send OTP to {recipient_email}: {exc}")
        print(f"[OTP DEMO] Fallback OTP for {recipient_email}: {otp}")
        return False

def generate_response(prompt):
    """Extract JSON from Claude's response"""
    claude_model = get_claude_model()
    if claude_model is None:
        raise RuntimeError("Claude model is not configured. Set ANTHROPIC_API_KEY to use content generation.")
    message = claude_model.invoke(prompt)
    text = message.content
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if json_match:
        return json_match.group(0)
    else:
        return ""

def generate_response_raw(prompt):
    """Get raw text response from Claude"""
    claude_model = get_claude_model()
    if claude_model is None:
        raise RuntimeError("Claude model is not configured. Set ANTHROPIC_API_KEY to use content generation.")
    message = claude_model.invoke(prompt)
    return message.content.strip()

def classify_input(user_input):
    """Classifies user input into topic and audience using Gemini if available, otherwise uses Claude."""
    if use_gemini:
        active_gemini_model = get_gemini_model()
        if active_gemini_model is not None:
            try:
                prompt = f"""Classify the following input into a topic and audience. If no audience is provided, default to college student.
                Return the response as a JSON object with "topic" and "audience" as keys.

                Input: {user_input}
                Output:
                """
                response = active_gemini_model.invoke(prompt)
                result = json.loads(response.content)
                return result
            except Exception as e:
                print(f"Error using Gemini for classification: {e}")

    claude_model = get_claude_model()
    if claude_model is None:
        return {"topic": user_input, "audience": "college student"}
    
    prompt = f"""Classify the following input into a topic to explain and an audience level. If no audience level is explicitly mentioned, default to "college student".

    Input: "{user_input}"

    Return ONLY a JSON object with "topic" and "audience" as keys. For example:
    {{
        "topic": "quantum physics",
        "audience": "high school students"
    }}
    """
    
    try:
        response = claude_model.invoke(prompt)
        text = response.content
        json_match = re.search(r"\{.*\}", text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group(0))
            return result
        else:
            return {"topic": user_input, "audience": "college student"}
    except Exception as e:
        print(f"Error classifying input: {e}")
        return {"topic": user_input, "audience": "college student"}

def create_storyboard(audience, topic):
    """Generate a storyboard of frames to explain the topic"""
    wikipedia_info = wikipedia.run(topic)
    prompt = STORYBOARD_PROMPT_TEMPLATE.format(audience=audience, topic=topic, wikipedia_info=wikipedia_info)
    storyboard_json = generate_response(prompt)
    try:
        return json.loads(storyboard_json)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        print(f"Received JSON: {storyboard_json}")
        return None

def generate_scene(frame):
    """Generate a scene description from a frame"""
    prompt = SCENE_AGENT_PROMPT_TEMPLATE.format(frame=frame)
    scene_json = generate_response(prompt)
    try:
        return json.loads(scene_json)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        print(f"Received JSON: {scene_json}")
        return None

def generate_animation_code(narration, animation_description, title, scene_number=None):
    """Generate Manim animation code for a scene"""
    if scene_number:
        scene_class_name = f"Scene{scene_number}"
    else:
        scene_class_name = ''.join(c for c in title if c.isalnum())
        if not scene_class_name:
            scene_class_name = "AnimationScene"
    
    prompt = """
0. Use EXTREMELY SIMPLE Manim code with NO LOOPS or complex logic,Generate only those stuff which is possible in manim , Don't try to use complex shape or function like ImageMobject.
1. Given the scene description and title, write COMPLETE, READY-TO-RUN Manim code for this scene in 3Blue1Brown style. This scene should be between 10 to 20 seconds.
2. USE MANIM COMMUNITY EDITION (ManimCE) VERSION 0.19.0 SYNTAX ONLY.
3. Include: from manim import *
4. Use "{0}" as class name (not "Scene").
5. DO NOT INCLUDE python TAGS OR ANY MARKDOWN.
6. DO NOT INCLUDE ANY INTRODUCTION LIKE "Here's the Manim code for the scene based on your requirements:" OR OTHER EXPLANATORY TEXT.
7. CRITICAL RESTRICTIONS:
   - ABSOLUTELY NO FOR LOOPS OR WHILE LOOPS
   - NO LIST COMPREHENSIONS
   - NO CUSTOM FUNCTIONS OR METHODS
   - USE ONLY SIMPLE SEQUENTIAL ANIMATIONS
   - LIMIT TO 5-7 SEQUENTIAL self.play() CALLS MAXIMUM
   - NO CONDITIONAL LOGIC (if/else statements)
8. AVOID:
   - ThoughtBubble (use Text, MathTex, SurroundingRectangle, or Circle)
   - Deprecated methods/parameters (add_tip(), scale_tips)
   - Constructor conflicts
   - Brace.get_text() (use Tex/MathTex and position manually)
9. For arrows: Arrow(start=ORIGIN, end=[x,y,0], buff=0, color=YELLOW)
10. For axes: Axes(x_range=[-5, 5, 1], y_range=[-3, 3, 1])
11. Use Text() or MathTex() with font_size 24-30pt.
12. Use standard animations: Create(), Write(), FadeIn/Out(), Transform(), GrowArrow()
13. Use [x, y, 0] coordinate system for all 2D points.
14. Include self.play() with self.wait() commands.

15. TEXT POSITIONING (CRITICAL):
   - NEVER place text on top of other text
   - For titles, use .to_edge(UP, buff=1) with sufficient buffer
   - For subtitles, position below titles with .next_to(title, DOWN, buff=0.5)
   - Use .shift(UP/DOWN/LEFT/RIGHT) to ensure text doesn't overlap
   - If using multiple text elements, create a VGroup and use .arrange(DOWN, buff=0.5)
   - Always add sufficient spacing between text elements (minimum buff=0.3)
   - For multi-line text, create separate Text objects and arrange them vertically

16. Use colors: RED, GREEN, BLUE, YELLOW, PURPLE, ORANGE, WHITE.
17. Use 2-AXIS DIAGRAMS for math concepts.
18. Don't invent parameters.
19. Keep text concise (<10 words).
20. Follow title if description is vague.
21. Include animations and place topic at bottom.
22. NEVER USE 'scale_tips' PARAMETER.
23. NEVER use random() or random.choice() functions
24.DON'T DO THIS "```python" IN THE CODE BLOCK, JUST WRITE THE MANIM CODE.
25. For 384px height compatibility:
   - Center elements (±3 units from center)
   - Keep content in middle 70% of screen
   - Use font_size≥24
   - Maximum 3-4 elements at once
   - Scale complex equations to 0.8
   - Keep 0.5 units padding from edges
   - Use WHITE/YELLOW text on dark backgrounds
   - Scale complex diagrams to 0.7

Here is an example of valid Manim CE 0.19.0 code:

from manim import *

class VectorExample(Scene):
    def construct(self):
        # Create axes
        axes = Axes(
            x_range=[-5, 5, 1], 
            y_range=[-3, 3, 1],
            axis_config={{"color": BLUE}}
        )
        
        # Create a vector as an arrow
        vector = Arrow(start=ORIGIN, end=[2, 1, 0], buff=0, color=YELLOW)
        vector_label = MathTex(r"\\vec{{v}} = (2,1)").next_to(vector, UP)
        
        # Create components
        x_component = DashedLine(start=ORIGIN, end=[2, 0, 0], color=RED)
        y_component = DashedLine(start=[2, 0, 0], end=[2, 1, 0], color=GREEN)
        
        x_label = MathTex("2").next_to(x_component, DOWN)
        y_label = MathTex("1").next_to(y_component, RIGHT)
        
        # Animation sequence
        self.play(Create(axes))
        self.wait(0.5)
        self.play(GrowArrow(vector), Write(vector_label))
        self.wait(0.5)
        self.play(Create(x_component), Write(x_label))
        self.wait(0.5)
        self.play(Create(y_component), Write(y_label))
        self.wait(1)

Narration: 
{1}

Animation Description:
{2}

Title:
{3}

ONLY RETURN THE COMPLETE MANIM CODE FOR THE SCENE. DO NOT INCLUDE A PREAMBLE OR POSTAMBLE.
""".format(scene_class_name, narration, animation_description, title) 
    
    response = generate_response_raw(prompt)
    if not response:
        response = f"""from manim import *
class {scene_class_name}(Scene):
    def construct(self):
        text = Text("No animation generated", font_size=48)
        self.play(Write(text))
        self.wait(1)
        """

    response = response.replace("scale_tips=True", "")
    response = response.replace("scale_tips=False", "")
    response = response.replace("scale_tips = True", "")
    response = response.replace("scale_tips = False", "")
    response = response.replace(", scale_tips", "")
    response = response.replace(",scale_tips", "")

    run_instructions = """# To run this animation, use the following command:
# manim -pql <filename>.py {0}
# or for higher quality:
# manim -pqh <filename>.py {0}
""".format(scene_class_name)

    return run_instructions + response

def generate_educational_content(user_input):
    """Generate complete educational content from a user input"""
    classification = classify_input(user_input)
    audience = classification.get("audience", "college student")
    topic = classification.get("topic", user_input)
    
    storyboard = create_storyboard(audience, topic)
    result = {
        "metadata": {
            "topic": topic,
            "audience": audience
        },
        "success": False,
        "scenes": []
    }
    
    if storyboard and "frames" in storyboard:
        result["success"] = True
        
        for i, frame in enumerate(storyboard["frames"]):
            if i >= 5:
                break
            
            scene_number = i + 1
            scene_data = {
                "scene_number": scene_number,
                "title": frame["title"],
                "description": frame["description"]
            }
            
            scene = generate_scene(frame["description"])
            if scene:
                if "narration" in scene:
                    scene_data["narration"] = scene["narration"]
                if "animation-description" in scene:
                    scene_data["animation_description"] = scene["animation-description"]
                
                scene_data["assessment"] = {
                    "multiple_choice": {
                        "question": scene.get("multiple-choice-question", ""),
                        "choices": scene.get("multiple-choice-choices", []),
                        "correct_index": scene.get("correct-index", 0)
                    },
                    "free_response": {
                        "question": scene.get("free-response-question", ""),
                        "answer": scene.get("free-response-answer", "")
                    }
                }
                
                scene_data["manim_code"] = generate_animation_code(
                    scene.get("narration", ""), 
                    scene.get("animation-description", ""), 
                    frame["title"],
                    scene_number
                )
            
            result["scenes"].append(scene_data)
    
    return result

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "message": "Lerno API is running"}

class prompt(BaseModel):
    prompt:str


class OTPRequest(BaseModel):
    email: str
    mode: Optional[Literal["login", "signup"]] = "login"


class VerifyOTPRequest(BaseModel):
    email: str
    otp: str


class OnboardingRequest(BaseModel):
    email: str
    role: Literal["student", "faculty"]
    fullName: str
    phone: str = ""
    avatar: str = ""
    course: str = ""
    year: str = ""
    semester: str = ""
    department: str = ""
    designation: str = ""


class ProfileUpdateRequest(BaseModel):
    email: str
    fullName: str
    phone: str = ""
    avatar: str = ""
    course: str = ""
    year: str = ""
    semester: str = ""
    department: str = ""
    designation: str = ""


class PreferencesUpdateRequest(BaseModel):
    email: str
    theme: Optional[Literal["dark", "light"]] = None
    sidebarCollapsed: Optional[bool] = None


class LearningStateUpdateRequest(BaseModel):
    email: str
    recentTopics: Optional[List[Dict[str, Any]]] = None
    bookmarkedTopics: Optional[List[Dict[str, Any]]] = None
    currentSelection: Optional[Dict[str, Any]] = None


class TopicVideoOverrideRequest(BaseModel):
    facultyEmail: str
    subjectTitle: str
    unitTitle: str
    topicTitle: str
    videoUrl: str


@app.post("/send-otp")
async def send_otp(item: OTPRequest):
    email = normalize_email(item.email)
    mode = item.mode or "login"

    if not is_valid_college_email(email):
        raise HTTPException(
            status_code=400,
            detail="Please use your college email (e.g., 2301201171@krmu.edu.in)",
        )

    if mode == "login":
        db = ensure_firestore()
        doc_id = user_doc_id(email)

        def lookup_user():
            return db.collection("users").document(doc_id).get()

        user_doc = firestore_guard(lookup_user)
        if not user_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="No account found for this email. Please sign up first.",
            )

    otp = generate_otp()
    otp_store[email] = {
        "otp": otp,
        "expires_at": time.time() + OTP_EXPIRY_SECONDS,
    }

    email_sent = send_otp_email(email, otp)
    response = {
        "success": True,
        "message": "OTP sent successfully.",
        "email_sent": email_sent,
        "expires_in": OTP_EXPIRY_SECONDS,
    }

    if not email_sent:
        response["message"] = "OTP generated in demo mode. Check backend console if email is not configured."
        response["debug_otp"] = otp

    return response


@app.post("/verify-otp")
async def verify_otp(item: VerifyOTPRequest):
    email = normalize_email(item.email)
    otp = item.otp.strip()

    stored = otp_store.get(email)
    if not stored:
        raise HTTPException(status_code=400, detail="Please request a fresh OTP.")

    if time.time() > stored["expires_at"]:
        otp_store.pop(email, None)
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    if stored["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")

    otp_store.pop(email, None)
    session = build_session_payload(email)
    return {
        "success": True,
        "message": "OTP verified successfully.",
        "user": {
            "email": email,
            "name": email.split("@")[0],
        },
        "session": session,
    }


@app.get("/session/me")
async def get_session_me(email: str = Query(...)):
    normalized_email = normalize_email(email)

    if not is_valid_college_email(normalized_email):
        raise HTTPException(status_code=400, detail="Please use your college email.")

    return {
        "success": True,
        "session": build_session_payload(normalized_email),
    }


@app.post("/onboarding")
async def complete_onboarding(item: OnboardingRequest):
    normalized_email = normalize_email(item.email)

    if not is_valid_college_email(normalized_email):
        raise HTTPException(status_code=400, detail="Please use your college email.")

    full_name = item.fullName.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Please enter a valid full name.")

    phone = re.sub(r"\D", "", item.phone or "")
    if phone and len(phone) != 10:
        raise HTTPException(status_code=400, detail="Phone number must have 10 digits.")

    db = ensure_firestore()
    doc_id = user_doc_id(normalized_email)
    timestamp = now_ms()

    payload = {
        "uid": doc_id,
        "email": normalized_email,
        "role": item.role,
        "fullName": full_name,
        "phone": phone,
        "avatar": item.avatar.strip() or default_avatar(normalized_email),
        "isOnboarded": True,
        "updatedAt": timestamp,
    }

    if item.role == "student":
        payload.update(
            {
                "course": item.course.strip(),
                "year": item.year.strip(),
                "semester": item.semester.strip(),
                "department": item.department.strip(),
                "designation": "",
            }
        )
    else:
        payload.update(
            {
                "course": "",
                "year": "",
                "semester": "",
                "department": item.department.strip(),
                "designation": item.designation.strip(),
            }
        )

    def run():
        user_ref = db.collection("users").document(doc_id)
        existing_doc = user_ref.get()
        existing_data = existing_doc.to_dict() if existing_doc.exists else {}
        payload["createdAt"] = int(existing_data.get("createdAt", timestamp))
        user_ref.set(payload, merge=True)

        preferences_ref = db.collection("user_preferences").document(doc_id)
        if not preferences_ref.get().exists:
            preferences_ref.set(default_preferences(), merge=True)

        learning_ref = db.collection("learning_sessions").document(doc_id)
        if not learning_ref.get().exists:
            learning_ref.set(default_learning_state(), merge=True)

    firestore_guard(run)

    return {
        "success": True,
        "session": build_session_payload(normalized_email),
    }


@app.put("/profile")
async def update_profile(item: ProfileUpdateRequest):
    normalized_email = normalize_email(item.email)
    db = ensure_firestore()
    doc_id = user_doc_id(normalized_email)
    user_ref = db.collection("users").document(doc_id)
    existing_doc = firestore_guard(lambda: user_ref.get())

    if not existing_doc.exists:
        raise HTTPException(status_code=404, detail="User profile not found.")

    existing_data = existing_doc.to_dict() or {}
    role = existing_data.get("role")
    if role not in {"student", "faculty"}:
        raise HTTPException(status_code=400, detail="User role is not configured.")

    full_name = item.fullName.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Please enter a valid full name.")

    phone = re.sub(r"\D", "", item.phone or "")
    if phone and len(phone) != 10:
        raise HTTPException(status_code=400, detail="Phone number must have 10 digits.")

    payload = {
        "fullName": full_name,
        "phone": phone,
        "avatar": item.avatar.strip() or existing_data.get("avatar") or default_avatar(normalized_email),
        "updatedAt": now_ms(),
    }

    if role == "student":
        payload.update(
            {
                "course": item.course.strip(),
                "year": item.year.strip(),
                "semester": item.semester.strip(),
                "department": item.department.strip(),
            }
        )
    else:
        payload.update(
            {
                "department": item.department.strip(),
                "designation": item.designation.strip(),
            }
        )

    firestore_guard(lambda: user_ref.set(payload, merge=True))

    return {
        "success": True,
        "session": build_session_payload(normalized_email),
    }


@app.put("/preferences")
async def update_preferences(item: PreferencesUpdateRequest):
    normalized_email = normalize_email(item.email)
    db = ensure_firestore()
    doc_id = user_doc_id(normalized_email)
    preferences_ref = db.collection("user_preferences").document(doc_id)

    current = default_preferences()
    existing_doc = firestore_guard(lambda: preferences_ref.get())
    if existing_doc.exists:
        existing = existing_doc.to_dict() or {}
        current["theme"] = existing.get("theme") or current["theme"]
        current["sidebarCollapsed"] = bool(existing.get("sidebarCollapsed"))

    if item.theme:
        current["theme"] = item.theme
    if item.sidebarCollapsed is not None:
        current["sidebarCollapsed"] = bool(item.sidebarCollapsed)
    current["updatedAt"] = now_ms()

    firestore_guard(lambda: preferences_ref.set(current, merge=True))

    return {
        "success": True,
        "session": build_session_payload(normalized_email),
    }


@app.put("/learning-state")
async def update_learning_state(item: LearningStateUpdateRequest):
    normalized_email = normalize_email(item.email)
    db = ensure_firestore()
    doc_id = user_doc_id(normalized_email)
    learning_ref = db.collection("learning_sessions").document(doc_id)
    existing_doc = firestore_guard(lambda: learning_ref.get())
    existing = existing_doc.to_dict() or {}

    payload = {
        "recentTopics": sanitize_topic_list(
            item.recentTopics if item.recentTopics is not None else existing.get("recentTopics", [])
        ),
        "bookmarkedTopics": sanitize_topic_list(
            item.bookmarkedTopics
            if item.bookmarkedTopics is not None
            else existing.get("bookmarkedTopics", [])
        ),
        "currentSelection": sanitize_current_selection(
            item.currentSelection
            if item.currentSelection is not None
            else existing.get("currentSelection", {})
        ),
        "updatedAt": now_ms(),
    }

    firestore_guard(lambda: learning_ref.set(payload, merge=True))

    return {
        "success": True,
        "session": build_session_payload(normalized_email),
    }


@app.get("/faculty/dashboard")
async def get_faculty_dashboard(email: str = Query(...)):
    normalized_email = normalize_email(email)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    users_collection = db.collection("users")
    users = firestore_guard(lambda: [doc.to_dict() or {} for doc in users_collection.stream()])

    student_users = [user for user in users if user.get("role") == "student"]
    faculty_users = [user for user in users if user.get("role") == "faculty"]
    week_ago = now_ms() - 7 * 24 * 60 * 60 * 1000
    new_users_this_week = sum(
        1 for user in users if int(user.get("createdAt", 0)) >= week_ago
    )

    recent_onboardings = sorted(
        users,
        key=lambda user: int(user.get("createdAt", 0)),
        reverse=True,
    )[:5]

    return {
        "facultyProfile": session.get("profile"),
        "stats": {
            "studentCount": len(student_users),
            "facultyCount": len(faculty_users),
            "newUsersThisWeek": new_users_this_week,
        },
        "recentOnboardings": [
            serialize_user(user, user.get("email", "")) for user in recent_onboardings if user.get("email")
        ],
        "assignedSubjects": [
            "Onboarding Oversight",
            "Learning Analytics Review",
            "Managed Subjects Coming Soon",
        ],
    }


@app.get("/topic-video-override")
async def get_topic_video_override(
    subjectTitle: str = Query(...),
    unitTitle: str = Query(...),
    topicTitle: str = Query(...),
):
    db = ensure_firestore()
    doc_id = topic_override_doc_id(subjectTitle, unitTitle, topicTitle)
    override_ref = db.collection("topic_video_overrides").document(doc_id)
    override_doc = firestore_guard(lambda: override_ref.get())

    if not override_doc.exists:
      return {
          "success": True,
          "override": None,
      }

    data = override_doc.to_dict() or {}
    return {
        "success": True,
        "override": {
            "subjectTitle": data.get("subjectTitle", ""),
            "unitTitle": data.get("unitTitle", ""),
            "topicTitle": data.get("topicTitle", ""),
            "videoUrl": data.get("videoUrl", ""),
            "updatedByFaculty": data.get("updatedByFaculty", ""),
            "updatedAt": int(data.get("updatedAt", now_ms())),
        },
    }


@app.get("/topic-video-overrides")
async def list_topic_video_overrides(email: str = Query(...)):
    normalized_email = normalize_email(email)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    collection = db.collection("topic_video_overrides")
    docs = firestore_guard(lambda: [doc.to_dict() or {} for doc in collection.stream()])
    overrides = sorted(
        [
            {
                "subjectTitle": doc.get("subjectTitle", ""),
                "unitTitle": doc.get("unitTitle", ""),
                "topicTitle": doc.get("topicTitle", ""),
                "videoUrl": doc.get("videoUrl", ""),
                "updatedByFaculty": doc.get("updatedByFaculty", ""),
                "updatedAt": int(doc.get("updatedAt", 0)),
            }
            for doc in docs
            if doc.get("videoUrl")
        ],
        key=lambda item: item.get("updatedAt", 0),
        reverse=True,
    )

    return {
        "success": True,
        "overrides": overrides,
    }


@app.put("/topic-video-override")
async def save_topic_video_override(item: TopicVideoOverrideRequest):
    normalized_email = normalize_email(item.facultyEmail)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    subject_title = item.subjectTitle.strip()
    unit_title = item.unitTitle.strip()
    topic_title = item.topicTitle.strip()
    video_url = item.videoUrl.strip()

    if not all([subject_title, unit_title, topic_title, video_url]):
        raise HTTPException(status_code=400, detail="Subject, unit, topic, and video URL are required.")

    doc_id = topic_override_doc_id(subject_title, unit_title, topic_title)
    override_ref = db.collection("topic_video_overrides").document(doc_id)

    firestore_guard(
        lambda: override_ref.set(
            {
                "subjectTitle": subject_title,
                "unitTitle": unit_title,
                "topicTitle": topic_title,
                "videoUrl": video_url,
                "updatedByFaculty": normalized_email,
                "updatedAt": now_ms(),
            },
            merge=True,
        )
    )

    return {
        "success": True,
        "message": "Faculty video saved successfully.",
    }


@app.post("/process-data")
async def index(item:prompt):
    """API endpoint to generate educational content"""
    try:
        # Generate educational content from the prompt
        result = generate_educational_content(item.prompt)
        video_urls=[]
        for scene in result.get("scenes", []):
            manim_code = scene.get("manim_code", "No Manim code generated")
            scene_number = scene.get("scene_number",1)
            animation_file = f"animation_{scene_number}.py"
            with open(animation_file, "w", encoding="utf-8") as f:
                f.write(manim_code)
            print(f"Wrote file: {animation_file}")

            print(f"Starting Manim rendering for Scene{scene_number}...")
            process = subprocess.run(
                ["manim", "-pql", "--progress_bar", "none", animation_file, f"Scene{scene_number}"],
                capture_output=True,
                text=True,
                check=False 
            )
            
            mp4_path= f"media/videos/animation_{scene_number}/480p15/Scene{scene_number}.mp4"

            if os.path.exists(mp4_path):
                if bucket is not None:
                    file_name = f"{uuid.uuid4()}_Scene{scene_number}.mp4"
                    blob = bucket.blob(file_name)
                    blob.upload_from_filename(mp4_path, content_type="video/mp4")
                    blob.make_public()
                    video_urls.append(blob.public_url)
                    print(f"Successfully uploaded {mp4_path} to Firebase")
                else:
                    print("Firebase Storage bucket is not configured; skipping video upload.")
            else:
                print(f"Rendered video not found at {mp4_path}")

        return {
            "status": "success",
            "data": result,
            "video_urls": video_urls,
            "message": "Educational content generated successfully"
        }
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"ERROR: {str(e)}")
        print(f"TRACEBACK: {error_details}")
        
        # Return mock data for testing when API fails
        print("Returning mock data for testing...")
        mock_data = {
            "status": "success",
            "message": "Mock data for testing (API credits needed for real data)",
            "data": {
                "scenes": [
                    {
                        "scene_number": 1,
                        "title": "Introduction",
                        "description": "An introduction to the topic",
                        "narration": "Welcome to this educational video. Today we'll explore the fundamentals of this concept.",
                        "animation_description": "Show title text with animated background",
                        "manim_code": "# Mock scene",
                        "assessment": {
                            "multiple_choice": {
                                "question": "What is the first step?",
                                "choices": ["Option A", "Option B", "Option C", "Option D"],
                                "correct_index": 0
                            },
                            "free_response": {
                                "question": "Explain in your own words",
                                "answer": "Sample answer"
                            }
                        }
                    },
                    {
                        "scene_number": 2,
                        "title": "Main Concept",
                        "description": "Explaining the core concept",
                        "narration": "Now let's dive deeper into the main concept. This is an important part.",
                        "animation_description": "Show diagrams and visual explanations",
                        "manim_code": "# Mock scene",
                        "assessment": {
                            "multiple_choice": {
                                "question": "Which is correct?",
                                "choices": ["A", "B", "C", "D"],
                                "correct_index": 1
                            },
                            "free_response": {
                                "question": "What did you learn?",
                                "answer": "Sample answer"
                            }
                        }
                    },
                    {
                        "scene_number": 3,
                        "title": "Summary",
                        "description": "Summarizing what we learned",
                        "narration": "In summary, we've covered the key points of this topic.",
                        "animation_description": "Show summary with key points",
                        "manim_code": "# Mock scene",
                        "assessment": {
                            "multiple_choice": {
                                "question": "What was the main takeaway?",
                                "choices": ["Point 1", "Point 2", "Point 3", "Point 4"],
                                "correct_index": 2
                            },
                            "free_response": {
                                "question": "How will you apply this?",
                                "answer": "Sample answer"
                            }
                        }
                    }
                ]
            },
            "video_urls": []
        }
        return mock_data

    # /send-otp endpoint removed

    # /verify-otp endpoint removed
