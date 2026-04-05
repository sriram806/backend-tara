from typing import Dict, List

from app.core.config import settings
from app.services.skill_dictionary import expected_skills_for_role

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover
    SentenceTransformer = None


class SemanticMatcher:
    def __init__(self):
        self._model = None

    def _get_model(self):
        if self._model is not None:
            return self._model
        if not SentenceTransformer:
            self._model = None
            return self._model
        try:
            self._model = SentenceTransformer(settings.SEMANTIC_MODEL_NAME)
        except Exception:
            self._model = None
        return self._model

    def _cosine(self, v1: List[float], v2: List[float]) -> float:
        dot = sum(a * b for a, b in zip(v1, v2))
        n1 = sum(a * a for a in v1) ** 0.5
        n2 = sum(b * b for b in v2) ** 0.5
        if n1 == 0 or n2 == 0:
            return 0.0
        return dot / (n1 * n2)

    def compare(self, user_skills: List[str], target_role: str) -> Dict[str, object]:
        expected = expected_skills_for_role(target_role)
        user_set = {s.lower() for s in user_skills}

        matched = [skill for skill in expected if skill.lower() in user_set]
        missing = [skill for skill in expected if skill.lower() not in user_set]

        model = self._get_model()
        if model:
            role_text = f"{target_role} requires: {', '.join(expected)}"
            user_text = f"Candidate has: {', '.join(user_skills)}"
            emb = model.encode([role_text, user_text])
            score = float(self._cosine(emb[0], emb[1]))
        else:
            union = len(set(skill.lower() for skill in expected).union(user_set))
            overlap = len(set(skill.lower() for skill in expected).intersection(user_set))
            score = float(overlap / union) if union else 0.0

        return {
            "similarityScore": round(score, 4),
            "matchedSkills": matched,
            "missingSkills": missing,
            "expectedSkills": expected,
        }


semantic_matcher = SemanticMatcher()
