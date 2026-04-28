import json
import os
import re
import uuid
from functools import lru_cache
from typing import Any, Dict, List, Optional


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")


def _load_json_file(filename: str):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


@lru_cache(maxsize=1)
def load_university_registry() -> List[Dict[str, Any]]:
    return _load_json_file("campusRegistry.json")


@lru_cache(maxsize=1)
def load_starter_content_packs() -> List[Dict[str, Any]]:
    return _load_json_file("campusContentPacks.json")


def get_default_university() -> Optional[Dict[str, Any]]:
    registry = load_university_registry()
    return registry[0] if registry else None


def find_university(university_id: str = "", university_slug: str = "") -> Optional[Dict[str, Any]]:
    normalized_id = (university_id or "").strip().lower()
    normalized_slug = (university_slug or "").strip().lower()

    for university in load_university_registry():
        if normalized_id and university.get("id", "").strip().lower() == normalized_id:
            return university
        if normalized_slug and university.get("slug", "").strip().lower() == normalized_slug:
            return university

    return get_default_university()


def find_department(university: Optional[Dict[str, Any]], department_id: str = "") -> Optional[Dict[str, Any]]:
    if not university:
        return None
    normalized_department_id = (department_id or "").strip().lower()
    for department in university.get("departments", []):
        if department.get("id", "").strip().lower() == normalized_department_id:
            return department
    return university.get("departments", [None])[0]


def find_program(department: Optional[Dict[str, Any]], program_id: str = "") -> Optional[Dict[str, Any]]:
    if not department:
        return None
    normalized_program_id = (program_id or "").strip().lower()
    for program in department.get("programs", []):
        if program.get("id", "").strip().lower() == normalized_program_id:
            return program
    return department.get("programs", [None])[0]


def find_term(program: Optional[Dict[str, Any]], term_id: str = "") -> Optional[Dict[str, Any]]:
    if not program:
        return None
    normalized_term_id = (term_id or "").strip().lower()
    for term in program.get("terms", []):
        if term.get("id", "").strip().lower() == normalized_term_id:
            return term
    return program.get("terms", [None])[0]


def _infer_university_from_email(email: str) -> Optional[Dict[str, Any]]:
    normalized_email = (email or "").strip().lower()
    if "@" not in normalized_email:
        return get_default_university()

    domain = normalized_email.split("@", 1)[1]
    for university in load_university_registry():
        domains = [item.strip().lower() for item in university.get("emailDomains", [])]
        if domain in domains:
            return university

    return get_default_university()


def _infer_academic_selection(course: str = "", semester: str = "", department: str = "") -> Dict[str, str]:
    course_text = (course or "").strip().lower()
    semester_text = (semester or "").strip().lower()
    department_text = (department or "").strip().lower()
    combined = " ".join([course_text, semester_text, department_text]).strip()

    if "mba" in combined or "management" in combined or "bba" in combined:
        return {
            "departmentId": "management",
            "programId": "mba-core",
            "termId": "term-1",
        }

    if "commerce" in combined or "bcom" in combined:
        return {
            "departmentId": "commerce",
            "programId": "bcom",
            "termId": "semester-2",
        }

    return {
        "departmentId": "cs-engineering",
        "programId": "bca",
        "termId": "semester-6",
    }


def resolve_campus_selection(
    email: str = "",
    university_id: str = "",
    university_slug: str = "",
    department_id: str = "",
    program_id: str = "",
    term_id: str = "",
    course: str = "",
    semester: str = "",
    department_name: str = "",
) -> Dict[str, str]:
    university = find_university(university_id, university_slug) or _infer_university_from_email(email)
    inferred = _infer_academic_selection(course, semester, department_name)

    department = find_department(university, department_id or inferred["departmentId"])
    program = find_program(department, program_id or inferred["programId"])
    term = find_term(program, term_id or inferred["termId"])

    return {
        "universityId": university.get("id", "") if university else "",
        "universitySlug": university.get("slug", "") if university else "",
        "universityName": university.get("name", "") if university else "",
        "departmentId": department.get("id", "") if department else "",
        "departmentName": department.get("name", "") if department else "",
        "programId": program.get("id", "") if program else "",
        "programName": program.get("name", "") if program else "",
        "termId": term.get("id", "") if term else "",
        "termName": term.get("name", "") if term else "",
    }


def verification_status_for_email(email: str, university_id: str = "", university_slug: str = "") -> str:
    normalized_email = (email or "").strip().lower()
    if "@" not in normalized_email:
        return "unverified"

    university = find_university(university_id, university_slug)
    if not university:
        return "otp_verified"

    trusted_domains = [
        item.strip().lower()
        for item in university.get("verificationRules", {}).get("trustedDomains", [])
    ]
    domain = normalized_email.split("@", 1)[1]
    return "trusted_domain" if domain in trusted_domains else "otp_verified"


def generate_referral_code(email: str, full_name: str = "") -> str:
    seed = re.sub(r"[^a-z0-9]", "", (full_name or email).lower())
    seed = (seed[:6] or "lerno").upper()
    suffix = uuid.uuid4().hex[:4].upper()
    return f"{seed}{suffix}"


def build_profile_context(
    email: str,
    existing_data: Optional[Dict[str, Any]] = None,
    pending_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    existing_data = existing_data or {}
    pending_context = pending_context or {}

    selection = resolve_campus_selection(
        email=email,
        university_id=str(
            existing_data.get("universityId") or pending_context.get("universityId") or ""
        ),
        university_slug=str(
            existing_data.get("universitySlug") or pending_context.get("universitySlug") or ""
        ),
        department_id=str(
            existing_data.get("departmentId") or pending_context.get("departmentId") or ""
        ),
        program_id=str(existing_data.get("programId") or pending_context.get("programId") or ""),
        term_id=str(existing_data.get("termId") or pending_context.get("termId") or ""),
        course=str(existing_data.get("course") or pending_context.get("course") or ""),
        semester=str(existing_data.get("semester") or pending_context.get("termName") or ""),
        department_name=str(
            existing_data.get("department")
            or existing_data.get("departmentName")
            or pending_context.get("departmentName")
            or ""
        ),
    )

    referral_code = (
        str(existing_data.get("referralCode") or pending_context.get("referralCode") or "").strip()
        or generate_referral_code(email, str(existing_data.get("fullName") or ""))
    )

    return {
        **selection,
        "verificationStatus": str(
            existing_data.get("verificationStatus")
            or pending_context.get("verificationStatus")
            or verification_status_for_email(
                email,
                selection.get("universityId", ""),
                selection.get("universitySlug", ""),
            )
        ),
        "referralCode": referral_code,
        "referredByCode": str(
            existing_data.get("referredByCode") or pending_context.get("referredByCode") or ""
        ).strip(),
    }


def content_pack_doc_id(university_id: str, program_id: str, term_id: str) -> str:
    return "::".join(
        [
            (university_id or "").strip().lower(),
            (program_id or "").strip().lower(),
            (term_id or "").strip().lower(),
        ]
    )


def build_starter_content_pack(
    university_id: str,
    university_slug: str,
    department_id: str,
    program_id: str,
    term_id: str,
) -> Optional[Dict[str, Any]]:
    university = find_university(university_id, university_slug)
    selection = resolve_campus_selection(
        university_id=university_id,
        university_slug=university_slug,
        department_id=department_id,
        program_id=program_id,
        term_id=term_id,
    )

    for pack in load_starter_content_packs():
        if (
            pack.get("departmentId") == selection.get("departmentId")
            and pack.get("programId") == selection.get("programId")
            and pack.get("termId") == selection.get("termId")
        ):
            return {
                **pack,
                "universityId": selection.get("universityId", ""),
                "universitySlug": selection.get("universitySlug", ""),
                "universityName": selection.get("universityName", ""),
                "departmentId": selection.get("departmentId", ""),
                "departmentName": selection.get("departmentName", ""),
                "programId": selection.get("programId", ""),
                "programName": selection.get("programName", ""),
                "termId": selection.get("termId", ""),
                "termName": selection.get("termName", ""),
                "source": "starter-seed",
            }

    if not university:
        return None

    return None
