import base64
import io
import json
import re
import os
from datetime import datetime, timedelta, timezone
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
from campus_data import (
    build_profile_context,
    build_starter_content_pack,
    content_pack_doc_id,
    resolve_campus_selection,
)

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

    def build_service_account_payload() -> Dict[str, Any]:
        private_key = firebase_private_key.strip()
        if private_key.startswith('"') and private_key.endswith('"'):
            private_key = private_key[1:-1]
        if private_key.startswith("'") and private_key.endswith("'"):
            private_key = private_key[1:-1]

        payload: Dict[str, Any] = {
            "type": "service_account",
            "project_id": firebase_project_id,
            "private_key_id": firebase_private_key_id,
            "private_key": private_key.replace("\\n", "\n"),
            "client_email": firebase_client_email,
            "client_id": firebase_client_id,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        }

        client_x509_cert_url = os.getenv("FIREBASE_CLIENT_X509_CERT_URL", "").strip()
        if client_x509_cert_url:
            payload["client_x509_cert_url"] = client_x509_cert_url

        return payload

    cred = None
    cred_source = None

    if firebase_project_id and firebase_private_key and firebase_client_email:
        try:
            cred = credentials.Certificate(build_service_account_payload())
            cred_source = "split FIREBASE_* env vars"
        except Exception as e:
            print(f"Firebase credentials from split env vars are invalid: {e}")
            cred = None

    if cred is None and firebase_json:
        try:
            cred = credentials.Certificate(json.loads(firebase_json))
            cred_source = "FIREBASE_SERVICE_ACCOUNT_JSON"
        except Exception as e:
            print(f"Firebase JSON from env is invalid: {e}")
            cred = None

    if cred is None and firebase_cred_path and os.path.exists(firebase_cred_path):
        try:
            with open(firebase_cred_path, "r", encoding="utf-8") as jf:
                json.load(jf)
        except Exception as e:
            print(f"Firebase credential file is present but invalid JSON: {e}")
        else:
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
            "Firebase credentials not found. Set split FIREBASE_* env vars, "
            "FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVICE_ACCOUNT_PATH to enable Firestore."
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


def safe_int(value: Any, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return default
        try:
            return int(float(text))
        except ValueError:
            return default
    if isinstance(value, datetime):
        dt = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return int(dt.timestamp() * 1000)
    if hasattr(value, "timestamp") and callable(getattr(value, "timestamp")):
        try:
            return int(value.timestamp() * 1000)
        except Exception:
            return default
    return default


def user_doc_id(email: str) -> str:
    return normalize_email(email)


def default_avatar(email: str) -> str:
    return f"https://api.dicebear.com/7.x/notionists-neutral/svg?seed={email}"


def is_valid_email_address(email: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", normalize_email(email)))


def topic_override_doc_id(
    university_id: str, subject_title: str, unit_title: str, topic_title: str
) -> str:
    key = "||".join(
        [
            (university_id or "").strip().lower(),
            (subject_title or "").strip().lower(),
            (unit_title or "").strip().lower(),
            (topic_title or "").strip().lower(),
        ]
    )
    return re.sub(r"[^a-z0-9|:_-]+", "-", key)


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
                "lastVisitedAt": safe_int(item.get("lastVisitedAt"), now_ms()),
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


TRACKABLE_EVENT_TYPES = {
    "signup_started",
    "signup_completed",
    "onboarding_completed",
    "first_lesson_viewed",
    "quiz_completed",
    "share_clicked",
    "referral_signup",
}


def sanitize_content_pack_subjects(subjects: Any) -> List[Dict[str, Any]]:
    if not isinstance(subjects, list):
        return []

    sanitized_subjects: List[Dict[str, Any]] = []
    for subject in subjects:
        if not isinstance(subject, dict):
            continue

        subject_id = str(subject.get("id") or subject.get("title") or uuid.uuid4().hex[:8]).strip()
        subject_title = str(subject.get("title") or subject_id).strip()
        if not subject_title:
            continue

        units = []
        for unit in subject.get("units", []) if isinstance(subject.get("units"), list) else []:
            if not isinstance(unit, dict):
                continue
            unit_title = str(unit.get("title", "")).strip()
            if not unit_title:
                continue
            units.append(
                {
                    "id": str(unit.get("id") or unit_title).strip().lower().replace(" ", "-"),
                    "title": unit_title,
                    "topics": [
                        str(topic).strip()
                        for topic in unit.get("topics", [])
                        if str(topic).strip()
                    ]
                    if isinstance(unit.get("topics"), list)
                    else [],
                }
            )

        topics = []
        for topic in subject.get("topics", []) if isinstance(subject.get("topics"), list) else []:
            if isinstance(topic, str):
                title = topic.strip()
                narration = ""
                video_url = ""
            elif isinstance(topic, dict):
                title = str(topic.get("title", "")).strip()
                narration = str(topic.get("narration", "")).strip()
                video_url = str(topic.get("videoUrl", "")).strip()
            else:
                continue

            if not title:
                continue

            topics.append(
                {
                    "title": title,
                    "narration": narration,
                    "videoUrl": video_url,
                }
            )

        sanitized_subjects.append(
            {
                "id": subject_id,
                "title": subject_title,
                "units": units,
                "topics": topics,
            }
        )

    return sanitized_subjects


def safe_slug(value: str, fallback: str = "item") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or fallback


def dedupe_strings(items: Any) -> List[str]:
    seen = set()
    deduped: List[str] = []
    for item in items if isinstance(items, list) else []:
        value = str(item).strip()
        normalized = value.lower()
        if not value or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(value)
    return deduped


def chunk_list(items: List[str], chunk_size: int) -> List[List[str]]:
    return [items[index:index + chunk_size] for index in range(0, len(items), chunk_size)]


def topic_count_from_subjects(subjects: Any) -> int:
    total = 0
    for subject in subjects if isinstance(subjects, list) else []:
        if not isinstance(subject, dict):
            continue
        total += len(subject.get("topics", []) if isinstance(subject.get("topics"), list) else [])
    return total


def build_review_inbox_item(pack: Dict[str, Any]) -> Dict[str, Any]:
    subjects = pack.get("subjects", []) if isinstance(pack.get("subjects"), list) else []
    unit_count = 0
    for subject in subjects:
        if isinstance(subject, dict):
            unit_count += len(subject.get("units", []) if isinstance(subject.get("units"), list) else [])

    return {
        "id": str(pack.get("id", "")).strip(),
        "name": str(pack.get("name", "")).strip(),
        "universityId": str(pack.get("universityId", "")).strip(),
        "universityName": str(pack.get("universityName", "")).strip(),
        "departmentName": str(pack.get("departmentName", "")).strip(),
        "programName": str(pack.get("programName", "")).strip(),
        "termName": str(pack.get("termName", "")).strip(),
        "reviewStatus": str(pack.get("reviewStatus", "draft")).strip() or "draft",
        "reviewNotes": str(pack.get("reviewNotes", "")).strip(),
        "generatedByAI": bool(pack.get("generatedByAI")),
        "subjectCount": len(subjects),
        "unitCount": unit_count,
        "topicCount": topic_count_from_subjects(subjects),
        "source": str(pack.get("source", "")).strip(),
        "ingestedBy": str(pack.get("ingestedBy", "")).strip(),
        "reviewedBy": str(pack.get("reviewedBy", "")).strip(),
        "reviewedAt": int(pack.get("reviewedAt", 0) or 0),
        "updatedAt": int(pack.get("updatedAt", 0) or 0),
    }


def share_artifact_public_payload(artifact: Dict[str, Any]) -> Dict[str, Any]:
    payload = artifact.get("payload", {}) if isinstance(artifact.get("payload"), dict) else {}
    notes = dedupe_strings(payload.get("notes", []))[:6]
    quiz_five = dedupe_strings(payload.get("fiveMarkQuestions", []))[:5]
    quiz_ten = dedupe_strings(payload.get("tenMarkQuestions", []))[:5]

    return {
        "id": str(artifact.get("id", "")).strip(),
        "artifactType": str(artifact.get("artifactType", "")).strip(),
        "shareTitle": str(artifact.get("shareTitle", "")).strip(),
        "shareText": str(artifact.get("shareText", "")).strip(),
        "topicTitle": str(artifact.get("topicTitle", "")).strip(),
        "subjectTitle": str(artifact.get("subjectTitle", "")).strip(),
        "unitTitle": str(artifact.get("unitTitle", "")).strip(),
        "universityId": str(artifact.get("universityId", "")).strip(),
        "universitySlug": str(artifact.get("universitySlug", "")).strip(),
        "universityName": str(artifact.get("universityName", "")).strip(),
        "referralCode": str(artifact.get("referralCode", "")).strip(),
        "createdAt": int(artifact.get("createdAt", 0) or 0),
        "payload": {
            "notes": notes,
            "narration": str(payload.get("narration", "")).strip(),
            "fiveMarkQuestions": quiz_five,
            "tenMarkQuestions": quiz_ten,
            "summary": str(payload.get("summary", "")).strip(),
        },
    }


def extract_text_from_import_payload(
    source_text: str = "",
    file_name: str = "",
    file_content_base64: str = "",
) -> str:
    if source_text.strip():
        return source_text.strip()

    if not file_content_base64.strip():
        return ""

    try:
        binary = base64.b64decode(file_content_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid file payload: {exc}") from exc

    extension = os.path.splitext(file_name or "")[1].lower()
    if extension == ".pdf":
        try:
            from pypdf import PdfReader
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail="PDF import needs the pypdf package on the backend.",
            ) from exc

        try:
            reader = PdfReader(io.BytesIO(binary))
            return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read PDF text: {exc}") from exc

    try:
        return binary.decode("utf-8", errors="ignore").strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode uploaded file: {exc}") from exc


def parse_syllabus_text_to_subjects(raw_text: str, program_name: str = "") -> List[Dict[str, Any]]:
    if not raw_text.strip():
        return []

    cleaned_text = (
        raw_text.replace("\r", "\n")
        .replace("\t", " ")
        .replace("•", "\n")
        .replace("▪", "\n")
        .replace("●", "\n")
    )

    lines = []
    for raw_line in cleaned_text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        line = re.sub(r"^[\-\*\u2022\d\.\)\(]+\s*", "", line).strip()
        if len(line) < 2:
            continue
        lines.append(line)

    if not lines:
        return []

    subjects: List[Dict[str, Any]] = []
    current_subject: Optional[Dict[str, Any]] = None
    current_unit: Optional[Dict[str, Any]] = None

    def ensure_subject(title: str):
        nonlocal current_subject, current_unit
        normalized_title = title.strip()
        if not normalized_title:
            return
        current_subject = {
            "id": safe_slug(normalized_title, f"subject-{len(subjects) + 1}"),
            "title": normalized_title,
            "units": [],
            "topics": [],
        }
        subjects.append(current_subject)
        current_unit = None

    def ensure_unit(title: str):
        nonlocal current_subject, current_unit
        if current_subject is None:
            ensure_subject(program_name or "Imported Subject")
        normalized_title = title.strip()
        if not normalized_title or current_subject is None:
            return
        current_unit = {
            "id": safe_slug(normalized_title, f"unit-{len(current_subject['units']) + 1}"),
            "title": normalized_title,
            "topics": [],
        }
        current_subject["units"].append(current_unit)

    def add_topic(title: str):
        nonlocal current_subject, current_unit
        normalized_title = title.strip(" -:")
        if not normalized_title:
            return
        if current_subject is None:
            ensure_subject(program_name or "Imported Subject")
        if current_unit is None:
            ensure_unit("Unit 1")
        if current_subject is None or current_unit is None:
            return
        topic_payload = {
            "title": normalized_title,
            "narration": f"Imported from syllabus for {normalized_title}.",
            "videoUrl": "",
        }
        current_subject["topics"].append(topic_payload)
        current_unit["topics"].append(normalized_title)

    for line in lines:
        lower = line.lower()
        subject_match = re.match(r"^(subject|course|paper)\s*[:\-]\s*(.+)$", line, flags=re.IGNORECASE)
        unit_match = re.match(
            r"^(unit|module|chapter)\s*(\d+|[ivx]+)?\s*[:\-]?\s*(.+)?$",
            line,
            flags=re.IGNORECASE,
        )

        if subject_match:
            ensure_subject(subject_match.group(2))
            continue

        if (
            not subject_match
            and current_subject is None
            and len(line.split()) <= 8
            and line.upper() == line
            and any(char.isalpha() for char in line)
        ):
            ensure_subject(line.title())
            continue

        if unit_match:
            unit_index = unit_match.group(2) or str((len(current_subject.get("units", [])) + 1) if current_subject else 1)
            unit_rest = (unit_match.group(3) or "").strip()
            ensure_unit(f"Unit {unit_index}" + (f" - {unit_rest}" if unit_rest else ""))
            continue

        add_topic(line)

    sanitized = sanitize_content_pack_subjects(subjects)
    if sanitized:
        return sanitized

    fallback_title = program_name or "Imported Subject"
    fallback_topics = dedupe_strings(lines)[:24]
    if not fallback_topics:
        return []

    fallback_subject = {
        "id": safe_slug(fallback_title, "imported-subject"),
        "title": fallback_title,
        "units": [],
        "topics": [],
    }
    for index, topic_group in enumerate(chunk_list(fallback_topics, 4), start=1):
        unit_title = f"Unit {index}"
        fallback_subject["units"].append(
            {
                "id": safe_slug(unit_title, f"unit-{index}"),
                "title": unit_title,
                "topics": topic_group,
            }
        )
        fallback_subject["topics"].extend(
            {
                "title": topic,
                "narration": f"Imported from syllabus for {topic}.",
                "videoUrl": "",
            }
            for topic in topic_group
        )

    return sanitize_content_pack_subjects([fallback_subject])


def build_event_context(email: str = "", context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    context = context or {}
    return {
        "email": normalize_email(email) if email else "",
        "universityId": str(context.get("universityId", "")).strip(),
        "universitySlug": str(context.get("universitySlug", "")).strip(),
        "departmentId": str(context.get("departmentId", "")).strip(),
        "programId": str(context.get("programId", "")).strip(),
        "termId": str(context.get("termId", "")).strip(),
        "referralCode": str(context.get("referralCode", "")).strip(),
        "verificationStatus": str(context.get("verificationStatus", "")).strip(),
    }


def log_event(
    db,
    event_type: str,
    email: str = "",
    context: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    if event_type not in TRACKABLE_EVENT_TYPES:
        return

    event_payload = build_event_context(email, context)
    event_payload.update(
        {
            "eventType": event_type,
            "metadata": metadata or {},
            "createdAt": now_ms(),
        }
    )
    db.collection("analytics_events").document(uuid.uuid4().hex).set(event_payload)


def event_day_key(timestamp_ms: int) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).date().isoformat()


def compute_streak_days(timestamps: List[int]) -> int:
    if not timestamps:
        return 0

    unique_days = sorted({event_day_key(ts) for ts in timestamps}, reverse=True)
    if not unique_days:
        return 0

    current = datetime.now(tz=timezone.utc).date()
    if unique_days[0] not in {current.isoformat(), (current - timedelta(days=1)).isoformat()}:
        return 0

    streak = 0
    expected_day = current if unique_days[0] == current.isoformat() else current - timedelta(days=1)
    unique_day_set = set(unique_days)
    while expected_day.isoformat() in unique_day_set:
        streak += 1
        expected_day -= timedelta(days=1)
    return streak


def leaderboard_rows(
    users: List[Dict[str, Any]],
    value_by_email: Dict[str, int],
    label: str,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    ranked_users = sorted(
        [
            {
                "email": user.get("email", ""),
                "fullName": user.get("fullName") or user.get("email", "").split("@")[0],
                "avatar": user.get("avatar") or default_avatar(user.get("email", "")),
                "value": int(value_by_email.get(user.get("email", ""), 0)),
                "label": label,
            }
            for user in users
            if user.get("email") and int(value_by_email.get(user.get("email", ""), 0)) > 0
        ],
        key=lambda item: item["value"],
        reverse=True,
    )[:limit]

    return [
        {
            "rank": index + 1,
            **item,
        }
        for index, item in enumerate(ranked_users)
    ]


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
    return f"Firestore request failed: {exc}"


def firestore_guard(operation):
    try:
        return operation()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=firestore_error_detail(exc)) from exc


def serialize_user(
    user_data: Optional[Dict[str, Any]],
    email: str,
    pending_context: Optional[Dict[str, Any]] = None,
):
    if not user_data:
        user_data = pending_context or {}

    normalized_email = normalize_email(email)
    role = user_data.get("role")
    profile_context = build_profile_context(normalized_email, user_data, pending_context)

    return {
        "uid": user_data.get("uid") or user_doc_id(normalized_email),
        "email": normalized_email,
        "role": role,
        "fullName": user_data.get("fullName") or normalized_email.split("@")[0],
        "phone": user_data.get("phone") or "",
        "avatar": user_data.get("avatar") or default_avatar(normalized_email),
        "isOnboarded": bool(user_data.get("isOnboarded")),
        "course": user_data.get("course") or profile_context.get("programName") or "",
        "year": user_data.get("year") or "",
        "semester": user_data.get("semester") or profile_context.get("termName") or "",
        "department": user_data.get("department") or profile_context.get("departmentName") or "",
        "designation": user_data.get("designation") or "",
        "universityId": profile_context.get("universityId") or "",
        "universitySlug": profile_context.get("universitySlug") or "",
        "universityName": profile_context.get("universityName") or "",
        "departmentId": profile_context.get("departmentId") or "",
        "departmentName": profile_context.get("departmentName") or "",
        "programId": profile_context.get("programId") or "",
        "programName": profile_context.get("programName") or "",
        "termId": profile_context.get("termId") or "",
        "termName": profile_context.get("termName") or "",
        "verificationStatus": profile_context.get("verificationStatus") or "",
        "referralCode": profile_context.get("referralCode") or "",
        "referredByCode": profile_context.get("referredByCode") or "",
        "createdAt": safe_int(user_data.get("createdAt"), now_ms()),
        "updatedAt": safe_int(user_data.get("updatedAt"), now_ms()),
    }


def build_session_payload(email: str, pending_context: Optional[Dict[str, Any]] = None):
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
                "updatedAt": safe_int(
                    preferences_data.get("updatedAt"),
                    preferences["updatedAt"],
                ),
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
                "updatedAt": safe_int(
                    learning_data.get("updatedAt"),
                    learning_state["updatedAt"],
                ),
            }
        )

        serialized_user = (
            serialize_user(user_data, normalized_email, pending_context)
            if user_data or pending_context
            else None
        )
        session_context = build_profile_context(normalized_email, user_data, pending_context)

        return {
            "isAuthenticated": True,
            "email": normalized_email,
            "exists": bool(user_data),
            "isOnboarded": bool(serialized_user and serialized_user.get("isOnboarded")),
            "role": serialized_user.get("role") if serialized_user else None,
            "profile": serialized_user,
            "preferences": preferences,
            "learningState": learning_state,
            "universityId": session_context.get("universityId", ""),
            "universitySlug": session_context.get("universitySlug", ""),
            "departmentId": session_context.get("departmentId", ""),
            "programId": session_context.get("programId", ""),
            "termId": session_context.get("termId", ""),
            "verificationStatus": session_context.get("verificationStatus", ""),
            "referralCode": session_context.get("referralCode", ""),
        }

    return firestore_guard(run)


def normalize_email(email: str) -> str:
    return email.strip().lower()

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
    role: Optional[Literal["student", "faculty"]] = None
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    referralCode: str = ""
    referredByCode: str = ""
    otpChannel: Optional[Literal["email"]] = "email"


class VerifyOTPRequest(BaseModel):
    email: str
    otp: str
    mode: Optional[Literal["login", "signup"]] = "login"
    role: Optional[Literal["student", "faculty"]] = None
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    referralCode: str = ""
    referredByCode: str = ""
    otpChannel: Optional[Literal["email"]] = "email"


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
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    verificationStatus: str = ""
    referralCode: str = ""
    referredByCode: str = ""
    otpChannel: Optional[Literal["email"]] = "email"


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
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    verificationStatus: str = ""
    referralCode: str = ""
    referredByCode: str = ""


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
    universityId: str = ""


class EventTrackRequest(BaseModel):
    eventType: Literal[
        "signup_started",
        "signup_completed",
        "onboarding_completed",
        "first_lesson_viewed",
        "quiz_completed",
        "share_clicked",
        "referral_signup",
    ]
    email: str = ""
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    referralCode: str = ""
    verificationStatus: str = ""
    metadata: Dict[str, Any] = {}


class ContentPackUpsertRequest(BaseModel):
    facultyEmail: str
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str
    programId: str
    termId: str
    packName: str = ""
    reviewStatus: Literal["draft", "review", "approved"] = "approved"
    reviewNotes: str = ""
    generatedByAI: bool = False
    subjects: List[Dict[str, Any]]


class ShareArtifactCreateRequest(BaseModel):
    email: str
    artifactType: Literal["topic", "notes", "explainer", "quiz"]
    topicTitle: str
    subjectTitle: str = ""
    unitTitle: str = ""
    shareTitle: str = ""
    shareText: str = ""
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    referralCode: str = ""
    payload: Dict[str, Any] = {}


class StudyPlannerRequest(BaseModel):
    email: str = ""
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str = ""
    termId: str = ""
    subjectTitle: str = ""
    topicTitles: List[str] = []
    completedPracticeTopics: List[str] = []
    examDate: str
    dailyMinutes: int = 60
    confidenceLevel: Literal["low", "medium", "high"] = "medium"


class ReviewActionRequest(BaseModel):
    facultyEmail: str
    contentPackId: str
    action: Literal["approve", "request_changes", "save_draft"]
    reviewNotes: str = ""


class SyllabusImportRequest(BaseModel):
    facultyEmail: str
    universityId: str = ""
    universitySlug: str = ""
    departmentId: str = ""
    programId: str
    termId: str
    sourceText: str = ""
    fileName: str = ""
    fileContentBase64: str = ""


def build_request_context(
    email: str = "",
    university_id: str = "",
    university_slug: str = "",
    department_id: str = "",
    program_id: str = "",
    term_id: str = "",
    department_name: str = "",
    course: str = "",
    semester: str = "",
    referral_code: str = "",
    referred_by_code: str = "",
    verification_status: str = "",
    role: Optional[str] = None,
):
    context = build_profile_context(
        normalize_email(email),
        {
            "universityId": university_id,
            "universitySlug": university_slug,
            "departmentId": department_id,
            "programId": program_id,
            "termId": term_id,
            "department": department_name,
            "course": course,
            "semester": semester,
            "referralCode": referral_code,
            "referredByCode": referred_by_code,
            "verificationStatus": verification_status,
            "role": role or "",
        },
    )
    if role:
        context["role"] = role
    return context


def get_or_seed_content_pack(db, selection: Dict[str, Any]):
    doc_id = content_pack_doc_id(
        selection.get("universityId", ""),
        selection.get("programId", ""),
        selection.get("termId", ""),
    )
    pack_ref = db.collection("campus_content_packs").document(doc_id)
    pack_doc = pack_ref.get()
    if pack_doc.exists:
        return pack_doc.to_dict() or {}

    starter_pack = build_starter_content_pack(
        selection.get("universityId", ""),
        selection.get("universitySlug", ""),
        selection.get("departmentId", ""),
        selection.get("programId", ""),
        selection.get("termId", ""),
    )
    if starter_pack:
        starter_pack["updatedAt"] = now_ms()
        pack_ref.set(starter_pack, merge=True)
        return starter_pack

    return None


def build_study_plan_response(item: StudyPlannerRequest) -> Dict[str, Any]:
    try:
        exam_date = datetime.strptime(item.examDate, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Exam date must be in YYYY-MM-DD format.") from exc

    today = datetime.now(timezone.utc).date()
    days_until_exam = max((exam_date - today).days, 0)
    all_topics = dedupe_strings(item.topicTitles)
    completed_topics = {topic.lower() for topic in dedupe_strings(item.completedPracticeTopics)}
    pending_topics = [topic for topic in all_topics if topic.lower() not in completed_topics]
    if not pending_topics:
        pending_topics = all_topics or [item.subjectTitle or "Core revision"]

    plan_days = max(1, min(7, days_until_exam + 1 if days_until_exam <= 14 else 7))
    daily_minutes = max(20, min(item.dailyMinutes, 240))
    per_day_groups = chunk_list(pending_topics, max(1, (len(pending_topics) + plan_days - 1) // plan_days))

    if days_until_exam <= 2:
        urgency = "critical"
    elif days_until_exam <= 7:
        urgency = "high"
    else:
        urgency = "steady"

    confidence_notes = {
        "low": "Start with high-yield summaries, then solve one easy practice set daily.",
        "medium": "Balance concept revision with exam-style answers and one recall sprint.",
        "high": "Keep revision short and spend more time on timed answers and weak-topic cleanup.",
    }

    daily_plan = []
    for index in range(plan_days):
        date_for_day = today + timedelta(days=index)
        day_topics = per_day_groups[index] if index < len(per_day_groups) else []
        label = "Exam Day" if date_for_day == exam_date else f"Day {index + 1}"
        checkpoint = (
            "Timed recall + short answer writing"
            if date_for_day == exam_date
            else "Finish revision and close with one quick recap"
        )
        daily_plan.append(
            {
                "dayLabel": label,
                "date": date_for_day.isoformat(),
                "focus": (
                    "Final exam polish"
                    if date_for_day == exam_date
                    else f"{item.subjectTitle or 'Subject'} revision block"
                ),
                "topicTitles": day_topics,
                "minutes": daily_minutes,
                "checkpoint": checkpoint,
            }
        )

    quick_wins = [
        f"Revise {pending_topics[0]} first because it anchors the current subject."
        if pending_topics
        else "Start with one high-yield topic before touching long notes.",
        confidence_notes[item.confidenceLevel],
        "End each session with a 10-minute self-test or verbal recap.",
    ]

    return {
        "success": True,
        "plan": {
            "mode": "exam_week" if days_until_exam <= 7 else "study_planner",
            "daysUntilExam": days_until_exam,
            "examDate": exam_date.isoformat(),
            "urgency": urgency,
            "subjectTitle": item.subjectTitle,
            "priorityTopics": pending_topics[:6],
            "completedTopics": [topic for topic in all_topics if topic.lower() in completed_topics],
            "dailyPlan": daily_plan,
            "quickWins": quick_wins,
            "finalRevisionChecklist": [
                "Review your top 3 weak topics once more.",
                "Write at least two answers in exam format.",
                "Keep one-page notes for formulas, frameworks, or definitions.",
                "Sleep on time before the exam day.",
            ],
            "summary": (
                f"{days_until_exam} day{'s' if days_until_exam != 1 else ''} left. "
                f"Focus on {len(pending_topics[:6])} priority topics with {daily_minutes} minutes per day."
            ),
        },
    }


@app.post("/send-otp")
async def send_otp(item: OTPRequest):
    email = normalize_email(item.email)
    mode = item.mode or "login"
    pending_context = build_request_context(
        email=email,
        university_id=item.universityId,
        university_slug=item.universitySlug,
        department_id=item.departmentId,
        program_id=item.programId,
        term_id=item.termId,
        referral_code=item.referralCode,
        referred_by_code=item.referredByCode,
        role=item.role,
    )

    if not is_valid_email_address(email):
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid university or personal email address.",
        )

    db = ensure_firestore()
    doc_id = user_doc_id(email)

    def lookup_user():
        return db.collection("users").document(doc_id).get()

    user_doc = firestore_guard(lookup_user)
    existing_data = user_doc.to_dict() or {}

    if mode == "login":
        if not user_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="No account found for this email. Please sign up first.",
            )
    elif user_doc.exists and bool(existing_data.get("isOnboarded")):
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this email. Please login instead.",
        )

    otp = generate_otp()
    otp_store[email] = {
        "otp": otp,
        "expires_at": time.time() + OTP_EXPIRY_SECONDS,
        "mode": mode,
        "context": pending_context,
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

    if mode == "signup":
        try:
            log_event(
                db,
                "signup_started",
                email=email,
                context=pending_context,
                metadata={"otpChannel": item.otpChannel or "email", "role": item.role or ""},
            )
        except Exception:
            pass

    return response


@app.post("/verify-otp")
async def verify_otp(item: VerifyOTPRequest):
    email = normalize_email(item.email)
    otp = item.otp.strip()
    pending_context = build_request_context(
        email=email,
        university_id=item.universityId,
        university_slug=item.universitySlug,
        department_id=item.departmentId,
        program_id=item.programId,
        term_id=item.termId,
        referral_code=item.referralCode,
        referred_by_code=item.referredByCode,
        role=item.role,
    )

    stored = otp_store.get(email)
    if not stored:
        raise HTTPException(status_code=400, detail="Please request a fresh OTP.")

    if time.time() > stored["expires_at"]:
        otp_store.pop(email, None)
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    if stored["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")

    otp_store.pop(email, None)
    session = build_session_payload(email, stored.get("context") or pending_context)

    if (item.mode or stored.get("mode") or "login") == "signup":
        db = ensure_firestore()
        try:
            log_event(
                db,
                "signup_completed",
                email=email,
                context=stored.get("context") or pending_context,
                metadata={"otpChannel": item.otpChannel or "email", "role": item.role or ""},
            )
        except Exception:
            pass

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

    if not is_valid_email_address(normalized_email):
        raise HTTPException(status_code=400, detail="Please enter a valid email.")

    return {
        "success": True,
        "session": build_session_payload(normalized_email),
    }


@app.post("/onboarding")
async def complete_onboarding(item: OnboardingRequest):
    normalized_email = normalize_email(item.email)

    if not is_valid_email_address(normalized_email):
        raise HTTPException(status_code=400, detail="Please enter a valid email.")

    full_name = item.fullName.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Please enter a valid full name.")

    phone = re.sub(r"\D", "", item.phone or "")
    if phone and len(phone) != 10:
        raise HTTPException(status_code=400, detail="Phone number must have 10 digits.")

    db = ensure_firestore()
    doc_id = user_doc_id(normalized_email)
    timestamp = now_ms()
    request_context = build_request_context(
        email=normalized_email,
        university_id=item.universityId,
        university_slug=item.universitySlug,
        department_id=item.departmentId,
        program_id=item.programId,
        term_id=item.termId,
        department_name=item.department,
        course=item.course,
        semester=item.semester,
        referral_code=item.referralCode,
        referred_by_code=item.referredByCode,
        verification_status=item.verificationStatus,
        role=item.role,
    )

    if not request_context.get("universityId"):
        raise HTTPException(status_code=400, detail="Please choose a university.")
    if not request_context.get("departmentId"):
        raise HTTPException(status_code=400, detail="Please choose a department family.")
    if item.role == "student" and (
        not request_context.get("programId") or not request_context.get("termId")
    ):
        raise HTTPException(status_code=400, detail="Please choose a program and term.")

    payload = {
        "uid": doc_id,
        "email": normalized_email,
        "role": item.role,
        "fullName": full_name,
        "phone": phone,
        "avatar": item.avatar.strip() or default_avatar(normalized_email),
        "isOnboarded": True,
        "updatedAt": timestamp,
        "universityId": request_context.get("universityId", ""),
        "universitySlug": request_context.get("universitySlug", ""),
        "universityName": request_context.get("universityName", ""),
        "departmentId": request_context.get("departmentId", ""),
        "departmentName": request_context.get("departmentName", ""),
        "programId": request_context.get("programId", ""),
        "programName": request_context.get("programName", ""),
        "termId": request_context.get("termId", ""),
        "termName": request_context.get("termName", ""),
        "verificationStatus": request_context.get("verificationStatus", ""),
        "referralCode": request_context.get("referralCode", ""),
        "referredByCode": request_context.get("referredByCode", ""),
    }

    if item.role == "student":
        payload.update(
            {
                "course": request_context.get("programName", item.course.strip()),
                "year": item.year.strip(),
                "semester": request_context.get("termName", item.semester.strip()),
                "department": request_context.get("departmentName", item.department.strip()),
                "designation": "",
            }
        )
    else:
        payload.update(
            {
                "course": "",
                "year": "",
                "semester": request_context.get("termName", ""),
                "department": request_context.get("departmentName", item.department.strip()),
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

        try:
            log_event(
                db,
                "onboarding_completed",
                email=normalized_email,
                context=request_context,
                metadata={"role": item.role},
            )
            if request_context.get("referredByCode"):
                log_event(
                    db,
                    "referral_signup",
                    email=normalized_email,
                    context=request_context,
                    metadata={"referredByCode": request_context.get("referredByCode", "")},
                )
        except Exception:
            pass

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
    request_context = build_request_context(
        email=normalized_email,
        university_id=item.universityId or str(existing_data.get("universityId", "")),
        university_slug=item.universitySlug or str(existing_data.get("universitySlug", "")),
        department_id=item.departmentId or str(existing_data.get("departmentId", "")),
        program_id=item.programId or str(existing_data.get("programId", "")),
        term_id=item.termId or str(existing_data.get("termId", "")),
        department_name=item.department or str(existing_data.get("departmentName", existing_data.get("department", ""))),
        course=item.course or str(existing_data.get("programName", existing_data.get("course", ""))),
        semester=item.semester or str(existing_data.get("termName", existing_data.get("semester", ""))),
        referral_code=item.referralCode or str(existing_data.get("referralCode", "")),
        referred_by_code=item.referredByCode or str(existing_data.get("referredByCode", "")),
        verification_status=item.verificationStatus or str(existing_data.get("verificationStatus", "")),
        role=str(role),
    )
    payload.update(
        {
            "universityId": request_context.get("universityId", ""),
            "universitySlug": request_context.get("universitySlug", ""),
            "universityName": request_context.get("universityName", ""),
            "departmentId": request_context.get("departmentId", ""),
            "departmentName": request_context.get("departmentName", ""),
            "programId": request_context.get("programId", ""),
            "programName": request_context.get("programName", ""),
            "termId": request_context.get("termId", ""),
            "termName": request_context.get("termName", ""),
            "verificationStatus": request_context.get("verificationStatus", ""),
            "referralCode": request_context.get("referralCode", ""),
            "referredByCode": request_context.get("referredByCode", ""),
        }
    )

    if role == "student":
        payload.update(
            {
                "course": request_context.get("programName", item.course.strip()),
                "year": item.year.strip(),
                "semester": request_context.get("termName", item.semester.strip()),
                "department": request_context.get("departmentName", item.department.strip()),
            }
        )
    else:
        payload.update(
            {
                "department": request_context.get("departmentName", item.department.strip()),
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
    campus_users = [
        user
        for user in users
        if user.get("universityId") == session.get("universityId")
    ] or users

    student_users = [user for user in campus_users if user.get("role") == "student"]
    faculty_users = [user for user in campus_users if user.get("role") == "faculty"]
    week_ago = now_ms() - 7 * 24 * 60 * 60 * 1000
    new_users_this_week = sum(
        1 for user in campus_users if int(user.get("createdAt", 0)) >= week_ago
    )

    recent_onboardings = sorted(
        campus_users,
        key=lambda user: int(user.get("createdAt", 0)),
        reverse=True,
    )[:5]
    content_pack = firestore_guard(lambda: get_or_seed_content_pack(db, session))

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
            subject.get("title", "")
            for subject in (content_pack or {}).get("subjects", [])[:5]
            if subject.get("title")
        ]
        or ["Pilot content pack not published yet"],
    }


@app.get("/topic-video-override")
async def get_topic_video_override(
    universityId: str = Query(""),
    subjectTitle: str = Query(...),
    unitTitle: str = Query(...),
    topicTitle: str = Query(...),
):
    db = ensure_firestore()
    doc_id = topic_override_doc_id(universityId, subjectTitle, unitTitle, topicTitle)
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
            "universityId": data.get("universityId", ""),
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
                "universityId": doc.get("universityId", ""),
                "subjectTitle": doc.get("subjectTitle", ""),
                "unitTitle": doc.get("unitTitle", ""),
                "topicTitle": doc.get("topicTitle", ""),
                "videoUrl": doc.get("videoUrl", ""),
                "updatedByFaculty": doc.get("updatedByFaculty", ""),
                "updatedAt": int(doc.get("updatedAt", 0)),
            }
            for doc in docs
            if doc.get("videoUrl")
            and doc.get("universityId") == session.get("universityId")
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

    university_id = session.get("universityId") or item.universityId
    doc_id = topic_override_doc_id(university_id, subject_title, unit_title, topic_title)
    override_ref = db.collection("topic_video_overrides").document(doc_id)

    firestore_guard(
        lambda: override_ref.set(
            {
                "universityId": university_id,
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


@app.post("/events")
async def track_event(item: EventTrackRequest):
    db = ensure_firestore()
    context = build_request_context(
        email=item.email,
        university_id=item.universityId,
        university_slug=item.universitySlug,
        department_id=item.departmentId,
        program_id=item.programId,
        term_id=item.termId,
        referral_code=item.referralCode,
        verification_status=item.verificationStatus,
    )

    firestore_guard(
        lambda: log_event(
            db,
            item.eventType,
            email=item.email,
            context=context,
            metadata=item.metadata or {},
        )
    )

    return {"success": True}


@app.get("/campus/growth")
async def get_campus_growth(email: str = Query(...)):
    normalized_email = normalize_email(email)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)
    university_id = session.get("universityId")

    if not university_id:
        raise HTTPException(status_code=400, detail="Campus context is missing for this user.")

    users = firestore_guard(
        lambda: [doc.to_dict() or {} for doc in db.collection("users").stream()]
    )
    campus_users = [
        user
        for user in users
        if user.get("email") and user.get("universityId") == university_id
    ]
    student_users = [user for user in campus_users if user.get("role") == "student"]
    user_by_email = {str(user.get("email", "")).strip().lower(): user for user in campus_users}
    referral_code_to_email = {
        str(user.get("referralCode", "")).strip().upper(): str(user.get("email", "")).strip().lower()
        for user in campus_users
        if str(user.get("referralCode", "")).strip()
    }

    events = firestore_guard(
        lambda: [doc.to_dict() or {} for doc in db.collection("analytics_events").stream()]
    )
    campus_events = [
        event
        for event in events
        if event.get("universityId") == university_id
    ]

    referral_counts: Dict[str, int] = {}
    quiz_counts: Dict[str, int] = {}
    lesson_timestamps: Dict[str, List[int]] = {}
    share_topic_counts: Dict[str, int] = {}

    week_ago_ms = now_ms() - 7 * 24 * 60 * 60 * 1000
    weekly_active_emails = set()

    for event in campus_events:
        event_type = str(event.get("eventType", "")).strip()
        event_email = normalize_email(str(event.get("email", "")).strip()) if event.get("email") else ""
        metadata = event.get("metadata", {}) if isinstance(event.get("metadata"), dict) else {}
        created_at = int(event.get("createdAt", 0) or 0)

        if created_at >= week_ago_ms and event_email:
            weekly_active_emails.add(event_email)

        if event_type == "referral_signup":
            referred_by_code = str(metadata.get("referredByCode", "")).strip().upper()
            referred_email = referral_code_to_email.get(referred_by_code)
            if referred_email:
                referral_counts[referred_email] = referral_counts.get(referred_email, 0) + 1
        elif event_type == "quiz_completed" and event_email:
            quiz_counts[event_email] = quiz_counts.get(event_email, 0) + 1
        elif event_type == "first_lesson_viewed" and event_email:
            lesson_timestamps.setdefault(event_email, []).append(created_at)
        elif event_type == "share_clicked":
            topic_title = str(metadata.get("topicTitle", "")).strip()
            if topic_title:
                share_topic_counts[topic_title] = share_topic_counts.get(topic_title, 0) + 1

    streak_counts = {
        email_key: compute_streak_days(timestamps)
        for email_key, timestamps in lesson_timestamps.items()
    }

    my_email = normalized_email
    my_profile = user_by_email.get(my_email, {})
    my_referral_code = str(
        session.get("referralCode")
        or (session.get("profile") or {}).get("referralCode")
        or my_profile.get("referralCode", "")
    ).strip()

    weekly_target = 150
    weekly_active_students = len(
        {
            active_email
            for active_email in weekly_active_emails
            if (user_by_email.get(active_email) or {}).get("role") == "student"
        }
    )

    return {
        "success": True,
        "leaderboards": {
            "referrals": leaderboard_rows(student_users, referral_counts, "referrals"),
            "streaks": leaderboard_rows(student_users, streak_counts, "day streak"),
            "quizzes": leaderboard_rows(student_users, quiz_counts, "quizzes"),
        },
        "ambassadorMetrics": {
            "inviteCount": referral_counts.get(my_email, 0),
            "referralCode": my_referral_code,
            "topSharedContent": [
                {"topicTitle": topic_title, "shares": count}
                for topic_title, count in sorted(
                    share_topic_counts.items(), key=lambda item: item[1], reverse=True
                )[:5]
            ],
            "weeklyActivationProgress": {
                "activeStudents": weekly_active_students,
                "targetStudents": weekly_target,
                "progressPercent": min(
                    100,
                    round((weekly_active_students / weekly_target) * 100) if weekly_target else 0,
                ),
            },
            "streakDays": streak_counts.get(my_email, 0),
            "quizzesCompleted": quiz_counts.get(my_email, 0),
        },
    }


@app.post("/share-artifacts")
async def create_share_artifact(item: ShareArtifactCreateRequest):
    normalized_email = normalize_email(item.email)
    if not is_valid_email_address(normalized_email):
        raise HTTPException(status_code=400, detail="Please enter a valid email.")

    session = build_session_payload(normalized_email)
    if not session.get("exists") or not session.get("isOnboarded"):
        raise HTTPException(status_code=403, detail="Only onboarded users can create share links.")

    db = ensure_firestore()
    context = build_request_context(
        email=normalized_email,
        university_id=item.universityId or str(session.get("universityId", "")),
        university_slug=item.universitySlug or str(session.get("universitySlug", "")),
        department_id=item.departmentId or str(session.get("departmentId", "")),
        program_id=item.programId or str(session.get("programId", "")),
        term_id=item.termId or str(session.get("termId", "")),
        referral_code=item.referralCode or str(session.get("referralCode", "")),
        verification_status=str(session.get("verificationStatus", "")),
        role=str(session.get("role", "")),
    )

    share_id = uuid.uuid4().hex[:12]
    artifact_payload = {
        "id": share_id,
        "artifactType": item.artifactType,
        "email": normalized_email,
        "topicTitle": item.topicTitle.strip(),
        "subjectTitle": item.subjectTitle.strip(),
        "unitTitle": item.unitTitle.strip(),
        "shareTitle": item.shareTitle.strip() or item.topicTitle.strip(),
        "shareText": item.shareText.strip(),
        "universityId": context.get("universityId", ""),
        "universitySlug": context.get("universitySlug", ""),
        "universityName": context.get("universityName", ""),
        "programId": context.get("programId", ""),
        "termId": context.get("termId", ""),
        "referralCode": context.get("referralCode", ""),
        "payload": item.payload if isinstance(item.payload, dict) else {},
        "createdAt": now_ms(),
    }

    firestore_guard(
        lambda: db.collection("share_artifacts").document(share_id).set(artifact_payload, merge=True)
    )

    return {
        "success": True,
        "shareArtifact": share_artifact_public_payload(artifact_payload),
    }


@app.get("/share-artifacts/{share_id}")
async def get_share_artifact(share_id: str):
    db = ensure_firestore()
    artifact_doc = firestore_guard(
        lambda: db.collection("share_artifacts").document(share_id.strip()).get()
    )
    if not artifact_doc.exists:
        raise HTTPException(status_code=404, detail="Shared artifact not found.")

    artifact = artifact_doc.to_dict() or {}
    return {"success": True, "shareArtifact": share_artifact_public_payload(artifact)}


@app.post("/study-planner")
async def build_study_planner(item: StudyPlannerRequest):
    return build_study_plan_response(item)


@app.get("/faculty/review-inbox")
async def get_faculty_review_inbox(email: str = Query(...)):
    normalized_email = normalize_email(email)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    university_id = str(session.get("universityId", "")).strip()
    packs = firestore_guard(
        lambda: [doc.to_dict() or {} for doc in db.collection("campus_content_packs").stream()]
    )
    university_packs = [
        pack for pack in packs if str(pack.get("universityId", "")).strip() == university_id
    ]
    pending_items = [
        build_review_inbox_item(pack)
        for pack in university_packs
        if str(pack.get("reviewStatus", "")).strip() in {"review", "draft"}
    ]
    recent_items = [
        build_review_inbox_item(pack)
        for pack in university_packs
        if str(pack.get("reviewStatus", "")).strip() == "approved"
    ]

    pending_items.sort(
        key=lambda item: (
            0 if item.get("reviewStatus") == "review" else 1,
            -int(item.get("updatedAt", 0) or 0),
        )
    )
    recent_items.sort(key=lambda item: -int(item.get("updatedAt", 0) or 0))

    return {
        "success": True,
        "pendingItems": pending_items[:10],
        "recentApproved": recent_items[:5],
    }


@app.post("/faculty/review-action")
async def apply_faculty_review_action(item: ReviewActionRequest):
    normalized_email = normalize_email(item.facultyEmail)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    pack_ref = db.collection("campus_content_packs").document(item.contentPackId.strip())
    pack_doc = firestore_guard(lambda: pack_ref.get())
    if not pack_doc.exists:
        raise HTTPException(status_code=404, detail="Content pack not found.")

    pack = pack_doc.to_dict() or {}
    if str(pack.get("universityId", "")).strip() != str(session.get("universityId", "")).strip():
        raise HTTPException(status_code=403, detail="You can only review content for your own campus.")

    action_to_status = {
        "approve": "approved",
        "request_changes": "review",
        "save_draft": "draft",
    }
    next_status = action_to_status[item.action]
    update_payload = {
        "reviewStatus": next_status,
        "reviewNotes": item.reviewNotes.strip(),
        "updatedAt": now_ms(),
        "reviewedBy": normalized_email if next_status == "approved" else "",
        "reviewedAt": now_ms() if next_status == "approved" else 0,
    }
    firestore_guard(lambda: pack_ref.set(update_payload, merge=True))
    updated_pack = firestore_guard(lambda: pack_ref.get().to_dict() or {})
    return {
        "success": True,
        "contentPack": build_review_inbox_item(updated_pack),
    }


@app.post("/admin/syllabus-import")
async def import_syllabus_payload(item: SyllabusImportRequest):
    normalized_email = normalize_email(item.facultyEmail)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    selection = build_request_context(
        email=normalized_email,
        university_id=item.universityId or str(session.get("universityId", "")),
        university_slug=item.universitySlug or str(session.get("universitySlug", "")),
        department_id=item.departmentId or str(session.get("departmentId", "")),
        program_id=item.programId,
        term_id=item.termId,
        role="faculty",
    )

    raw_text = extract_text_from_import_payload(
        source_text=item.sourceText,
        file_name=item.fileName,
        file_content_base64=item.fileContentBase64,
    )
    if not raw_text:
        raise HTTPException(status_code=400, detail="Please upload a syllabus file or paste syllabus text.")

    subjects = parse_syllabus_text_to_subjects(raw_text, selection.get("programName", ""))
    if not subjects:
        raise HTTPException(status_code=400, detail="Could not extract subjects or topics from the syllabus.")

    return {
        "success": True,
        "subjects": subjects,
        "suggestedPackName": f"{selection.get('programName', 'Campus')} imported syllabus pack",
        "previewText": raw_text[:1200],
        "detectedCounts": {
            "subjects": len(subjects),
            "topics": topic_count_from_subjects(subjects),
        },
    }


@app.get("/content-pack")
async def get_content_pack(
    universityId: str = Query(""),
    universitySlug: str = Query(""),
    departmentId: str = Query(""),
    programId: str = Query(...),
    termId: str = Query(...),
    subjectId: str = Query(""),
    includeUnpublished: bool = Query(False),
    email: str = Query(""),
):
    db = ensure_firestore()
    selection = resolve_campus_selection(
        university_id=universityId,
        university_slug=universitySlug,
        department_id=departmentId,
        program_id=programId,
        term_id=termId,
    )
    pack = firestore_guard(lambda: get_or_seed_content_pack(db, selection))
    if not pack:
        raise HTTPException(status_code=404, detail="No content pack found for this campus selection.")

    if pack.get("reviewStatus") != "approved" and not includeUnpublished:
        starter_pack = build_starter_content_pack(
            selection.get("universityId", ""),
            selection.get("universitySlug", ""),
            selection.get("departmentId", ""),
            selection.get("programId", ""),
            selection.get("termId", ""),
        )
        if starter_pack:
            pack = starter_pack

    if includeUnpublished:
        normalized_email = normalize_email(email)
        if not normalized_email:
            raise HTTPException(status_code=400, detail="Faculty email is required for unpublished preview.")
        preview_session = build_session_payload(normalized_email)
        if (
            preview_session.get("role") != "faculty"
            or preview_session.get("universityId") != selection.get("universityId")
        ):
            raise HTTPException(status_code=403, detail="Faculty preview access only.")

    if subjectId:
        subject = next(
            (
                item
                for item in pack.get("subjects", [])
                if str(item.get("id", "")).strip().lower() == subjectId.strip().lower()
            ),
            None,
        )
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found in this content pack.")
        return {"success": True, "contentPack": {**pack, "subjects": [subject]}}

    return {"success": True, "contentPack": pack}


@app.put("/admin/content-pack")
async def upsert_content_pack(item: ContentPackUpsertRequest):
    normalized_email = normalize_email(item.facultyEmail)
    db = ensure_firestore()
    session = build_session_payload(normalized_email)

    if session.get("role") != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access only.")

    selection = build_request_context(
        email=normalized_email,
        university_id=item.universityId or str(session.get("universityId", "")),
        university_slug=item.universitySlug or str(session.get("universitySlug", "")),
        department_id=item.departmentId or str(session.get("departmentId", "")),
        program_id=item.programId,
        term_id=item.termId,
        role="faculty",
    )
    subjects = sanitize_content_pack_subjects(item.subjects)
    if not subjects:
        raise HTTPException(status_code=400, detail="Please provide at least one valid subject.")

    payload = {
        "id": content_pack_doc_id(
            selection.get("universityId", ""),
            selection.get("programId", ""),
            selection.get("termId", ""),
        ),
        "name": item.packName.strip()
        or f"{selection.get('departmentName', '')} starter pack",
        "universityId": selection.get("universityId", ""),
        "universitySlug": selection.get("universitySlug", ""),
        "universityName": selection.get("universityName", ""),
        "departmentId": selection.get("departmentId", ""),
        "departmentName": selection.get("departmentName", ""),
        "programId": selection.get("programId", ""),
        "programName": selection.get("programName", ""),
        "termId": selection.get("termId", ""),
        "termName": selection.get("termName", ""),
        "reviewStatus": item.reviewStatus,
        "reviewNotes": item.reviewNotes.strip(),
        "generatedByAI": bool(item.generatedByAI),
        "subjects": subjects,
        "source": "manual-upload",
        "ingestedBy": normalized_email,
        "reviewedBy": normalized_email if item.reviewStatus == "approved" else "",
        "reviewedAt": now_ms() if item.reviewStatus == "approved" else 0,
        "updatedAt": now_ms(),
    }

    firestore_guard(
        lambda: db.collection("campus_content_packs")
        .document(payload["id"])
        .set(payload, merge=True)
    )

    return {"success": True, "contentPack": payload}


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
