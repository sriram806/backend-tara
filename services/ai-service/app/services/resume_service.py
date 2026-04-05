from typing import Dict, Any
import json
from app.services.llm_gateway import llm_gateway
from app.utils.security import sanitize_input
from app.core.config import settings


def _build_dummy_resume_analysis(resume_text: str) -> Dict[str, Any]:
    cleaned = (resume_text or "").strip()
    word_count = len(cleaned.split())
    score = 68 if word_count < 120 else 79

    return {
        "overallScore": score,
        "formattingIssues": [
            "Use consistent bullet punctuation across all sections",
            "Keep date formats consistent (e.g., MMM YYYY)",
            "Limit resume to 1-2 pages with concise section spacing"
        ],
        "impactImprovements": [
            "Replace task-based bullets with impact-based statements",
            "Add quantifiable outcomes (%, $, time saved)",
            "Start bullets with strong action verbs"
        ],
        "atsKeywordsMissing": [
            "microservices",
            "REST APIs",
            "CI/CD",
            "Docker",
            "cloud deployment"
        ]
    }

async def analyze_resume(data: Dict[str, Any], user_id: str = None) -> Dict[str, Any]:
    resume_text = sanitize_input(data.get("resumeText", ""))

    if settings.AI_MOCK_MODE:
        return _build_dummy_resume_analysis(resume_text)
    
    prompt = f"""
    You are an expert ATS (Applicant Tracking System) optimizer and resume reviewer. 
    Analyze the following resume text.
    
    Resume Text:
    {resume_text}
    
    Return a strictly structured JSON output containing exactly these fields and nothing else:
    {{
        "overallScore": <number 0-100>,
        "formattingIssues": [<array of identified formatting or syntax issues>],
        "impactImprovements": [<array of suggestions to make bullet points more impactful>],
        "atsKeywordsMissing": [<array of suggested keywords to include based on standard tech roles>]
    }}
    """
    
    return await llm_gateway.generate_json(prompt, user_id=user_id)
