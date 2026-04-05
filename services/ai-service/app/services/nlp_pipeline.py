import re
from typing import Any, Dict, List

from app.core.config import settings
from app.services.skill_dictionary import CANONICAL_SKILLS, normalize_skill

try:
    import spacy
except Exception:  # pragma: no cover
    spacy = None


class NLPPipeline:
    def __init__(self):
        self._nlp = None

    def _get_nlp(self):
        if self._nlp is not None:
            return self._nlp

        if not spacy:
            self._nlp = None
            return self._nlp

        try:
            self._nlp = spacy.load(settings.SPACY_MODEL_NAME)
        except Exception:
            self._nlp = spacy.blank("en")
        return self._nlp

    def clean_text(self, text: str) -> str:
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text).strip()
        return text[: settings.MAX_RESUME_CHARS]

    def tokenize(self, text: str) -> List[str]:
        nlp = self._get_nlp()
        if not nlp:
            return [t for t in re.split(r"\W+", text.lower()) if t]

        doc = nlp(text)
        return [token.text for token in doc if not token.is_space]

    def extract_entities(self, text: str) -> List[Dict[str, str]]:
        nlp = self._get_nlp()
        if not nlp:
            return []

        doc = nlp(text)
        return [{"text": ent.text, "label": ent.label_} for ent in doc.ents]

    def extract_skills(self, text: str) -> List[str]:
        lowered = (text or "").lower()
        extracted = set()

        for skill in CANONICAL_SKILLS:
            if skill.lower() in lowered:
                extracted.add(skill)

        extra_candidates = re.findall(r"[A-Za-z][A-Za-z0-9\+\.#/-]{1,25}", text or "")
        for candidate in extra_candidates:
            normalized = normalize_skill(candidate)
            if normalized in CANONICAL_SKILLS:
                extracted.add(normalized)

        return sorted(extracted)

    def extract_role_hint(self, text: str) -> str:
        text_lower = (text or "").lower()
        role_patterns = [
            "backend engineer",
            "frontend engineer",
            "full stack engineer",
            "data scientist",
            "devops engineer",
            "software engineer",
        ]
        for role in role_patterns:
            if role in text_lower:
                return role.title()
        return ""

    def extract_experience_years(self, text: str) -> int:
        if not text:
            return 0
        match = re.search(r"(\d{1,2})\+?\s+years?", text.lower())
        if not match:
            return 0
        return int(match.group(1))

    def run(self, text: str) -> Dict[str, Any]:
        cleaned = self.clean_text(text)
        return {
            "cleanedText": cleaned,
            "tokens": self.tokenize(cleaned),
            "entities": self.extract_entities(cleaned),
            "skills": self.extract_skills(cleaned),
            "roleHint": self.extract_role_hint(cleaned),
            "experienceYears": self.extract_experience_years(cleaned),
            "technologies": self.extract_skills(cleaned),
        }


nlp_pipeline = NLPPipeline()
