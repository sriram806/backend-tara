from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from app.database import db
from app.services.llm_gateway import llm_gateway


class GithubAnalyzerService:
    async def analyze_and_score(
        self,
        user_id: str,
        github_username: str,
        metrics: Dict[str, Any],
        normalized_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        ai_analysis = await self._analyze_repositories(normalized_data)

        developer_score = self._compute_developer_score(metrics, ai_analysis)
        level = self._derive_level(developer_score)
        strengths, weaknesses, recommendations = self._derive_feedback(metrics, ai_analysis)

        result = {
            "userId": user_id,
            "githubUsername": github_username,
            "developerScore": developer_score,
            "level": level,
            "metrics": metrics,
            "aiAnalysis": ai_analysis,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "lastAnalyzedAt": datetime.utcnow().isoformat(),
        }

        if db is not None:
            await db.github_metrics.insert_one(result)

        return result

    async def _analyze_repositories(self, normalized_data: Dict[str, Any]) -> Dict[str, Any]:
        repositories: List[Dict[str, Any]] = normalized_data.get("repositories", [])[:8]
        repo_payload = []
        for repo in repositories:
            repo_payload.append(
                {
                    "name": repo.get("fullName", repo.get("name", "unknown")),
                    "description": repo.get("description", ""),
                    "language": repo.get("language", ""),
                    "topics": repo.get("topics", []),
                    "readmePreview": (repo.get("readme", {}) or {}).get("contentPreview", "")[:2000],
                }
            )

        prompt = (
            "You are a strict engineering reviewer. Return ONLY raw JSON with keys: "
            "codeQuality, documentation, structure, bestPractices (all numbers 1-100). "
            f"Repositories: {repo_payload}"
        )

        try:
            ai_result = await llm_gateway.generate_json(prompt, user_id=normalized_data.get("githubUsername"))
            return {
                "codeQuality": self._clamp(ai_result.get("codeQuality", 60), 1, 100),
                "documentation": self._clamp(ai_result.get("documentation", 60), 1, 100),
                "structure": self._clamp(ai_result.get("structure", 60), 1, 100),
                "bestPractices": self._clamp(ai_result.get("bestPractices", 60), 1, 100),
            }
        except Exception:
            return {
                "codeQuality": 60,
                "documentation": 55,
                "structure": 60,
                "bestPractices": 58,
            }

    def _compute_developer_score(self, metrics: Dict[str, Any], ai_analysis: Dict[str, Any]) -> float:
        commit_consistency = float((metrics.get("commitVelocity", {}) or {}).get("consistency", 0)) * 100
        project_quality = float((metrics.get("projectDepth", {}) or {}).get("averageComplexity", 0)) * 10
        code_quality = float(ai_analysis.get("codeQuality", 0))
        open_source = float(metrics.get("openSourceScore", 0))
        language_diversity = min(float((metrics.get("languageDiversity", {}) or {}).get("uniqueLanguages", 0)) * 12.5, 100)
        activity_level = float(metrics.get("activityScore", 0))

        score = (
            (commit_consistency * 0.20)
            + (project_quality * 0.25)
            + (code_quality * 0.20)
            + (open_source * 0.15)
            + (language_diversity * 0.10)
            + (activity_level * 0.10)
        )

        return round(self._clamp(score, 0, 100), 2)

    def _derive_level(self, score: float) -> str:
        if score < 45:
            return "Beginner"
        if score < 75:
            return "Intermediate"
        return "Advanced"

    def _derive_feedback(self, metrics: Dict[str, Any], ai_analysis: Dict[str, Any]) -> tuple[List[str], List[str], List[str]]:
        strengths: List[str] = []
        weaknesses: List[str] = []
        recommendations: List[str] = []

        if float((metrics.get("commitVelocity", {}) or {}).get("consistency", 0)) >= 0.7:
            strengths.append("Strong commit consistency over recent weeks")
        else:
            weaknesses.append("Inconsistent contribution cadence")
            recommendations.append("Aim for steady weekly commits to improve consistency")

        if float((metrics.get("contributionQuality", {}) or {}).get("prMergeRate", 0)) >= 0.65:
            strengths.append("Healthy pull request merge rate")
        else:
            weaknesses.append("Low PR merge rate")
            recommendations.append("Refine PR descriptions and reduce review churn")

        if float(ai_analysis.get("documentation", 0)) >= 70:
            strengths.append("Documentation quality is above average")
        else:
            weaknesses.append("Documentation quality needs improvement")
            recommendations.append("Improve README clarity with setup and architecture sections")

        if float((metrics.get("languageDiversity", {}) or {}).get("uniqueLanguages", 0)) >= 3:
            strengths.append("Good language and stack diversity")
        else:
            weaknesses.append("Limited language diversity")
            recommendations.append("Explore one additional stack through a focused side project")

        if not recommendations:
            recommendations.append("Keep improving repo-level architecture notes and testing coverage")

        return strengths[:5], weaknesses[:5], recommendations[:5]

    @staticmethod
    def _clamp(value: Any, lower: float, upper: float) -> float:
        numeric = float(value)
        if numeric < lower:
            return lower
        if numeric > upper:
            return upper
        return numeric


github_analyzer_service = GithubAnalyzerService()
