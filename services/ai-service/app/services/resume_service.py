from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.database import db, redis_client
from app.models.resume_analysis_report import ResumeAnalysisReport, ResumeSectionScore
from app.services.llm_gateway import llm_gateway
from app.services.nlp_pipeline import nlp_pipeline
from app.services.semantic_matcher import semantic_matcher
from app.services.skill_dictionary import CANONICAL_SKILLS, expected_skills_for_role, normalize_skill
from app.services.user_resume_store import user_resume_store
from app.utils.security import sanitize_input, scrub_pii


REQUIRED_SECTIONS = ["Summary", "Experience", "Skills", "Projects", "Education"]


class ResumeService:
    def _clean_role(self, role: Optional[str]) -> str:
        return (role or "Software Engineer").strip() or "Software Engineer"

    def _hash_payload(self, raw_text: str, target_role: str, job_description: str) -> str:
        fingerprint = "|".join([
            raw_text,
            target_role.strip().lower(),
            job_description.strip().lower(),
        ])
        return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

    def _get_collection(self):
        return getattr(db, settings.RESUME_COLLECTION_NAME)

    def _fallback_sections(self, raw_text: str) -> Dict[str, str]:
        sections: Dict[str, str] = {}
        current = "Summary"
        sections[current] = ""
        known = {section.lower(): section for section in REQUIRED_SECTIONS}

        for line in raw_text.splitlines():
            cleaned = line.strip().strip(":")
            key = known.get(cleaned.lower())
            if key:
                current = key
                sections.setdefault(current, "")
                continue
            sections[current] = f"{sections.get(current, '')}\n{line}".strip()

        return sections

    def _extract_job_keywords(self, job_description: str) -> List[str]:
        if not job_description:
            return []

        detected = nlp_pipeline.extract_skills(job_description)

        keywords: List[str] = []
        for candidate in detected:
            cleaned = normalize_skill(candidate)
            if cleaned and cleaned in CANONICAL_SKILLS and cleaned not in keywords:
                keywords.append(cleaned)
        return keywords

    def _compute_format_score(self, raw_text: str, structured_text: Dict[str, Any]) -> Dict[str, Any]:
        word_count = len(re.findall(r"\b\w+\b", raw_text))
        line_count = len([line for line in raw_text.splitlines() if line.strip()])
        bullets = len(re.findall(r"(^|\n)\s*[-•*]\s+", raw_text))
        populated_sections = len([section for section in REQUIRED_SECTIONS if structured_text.get(section)])

        length_score = 0
        if 250 <= word_count <= 1200:
            length_score = 12
        elif 150 <= word_count < 250 or 1200 < word_count <= 1800:
            length_score = 9
        elif word_count >= 80:
            length_score = 6

        structure_score = min(6, populated_sections * 1.2)
        bullet_score = 2 if bullets >= 4 else 1 if bullets >= 2 else 0
        line_score = 0 if line_count < 8 else 2

        total = min(20, round(length_score + structure_score + bullet_score + line_score))
        notes: List[str] = []
        if word_count < 150:
            notes.append("Resume is very short and may need more detail")
        if populated_sections < 3:
            notes.append("Add clearer section headers and structure")
        if bullets < 2:
            notes.append("Use more bullet points for scanability")

        return {"score": total, "notes": notes}

    def _compute_section_scores(self, structured_text: Dict[str, Any]) -> Dict[str, ResumeSectionScore]:
        scores: Dict[str, ResumeSectionScore] = {}
        for section in REQUIRED_SECTIONS:
            section_text = (structured_text.get(section) or "").strip()
            if not section_text:
                scores[section] = ResumeSectionScore(
                    present=False,
                    score=0,
                    notes=[f"Missing {section.lower()} section"],
                )
                continue

            section_word_count = len(re.findall(r"\b\w+\b", section_text))
            section_score = 100
            notes: List[str] = []
            if section_word_count < 20:
                section_score = 70
                notes.append(f"Expand the {section.lower()} section")
            if section_word_count < 8:
                section_score = 50
                notes.append(f"Add more detail to the {section.lower()} section")

            scores[section] = ResumeSectionScore(
                present=True,
                score=section_score,
                notes=notes,
            )
        return scores

    def _build_rule_based_suggestions(
        self,
        target_role: str,
        extracted_skills: List[str],
        keyword_gaps: List[str],
        section_scores: Dict[str, ResumeSectionScore],
        format_notes: List[str],
    ) -> List[Dict[str, Any]]:
        suggestions: List[Dict[str, Any]] = []

        missing_sections = [section for section, score in section_scores.items() if not score.present]
        for section in missing_sections:
            suggestions.append(
                {
                    "type": "warning",
                    "section": section,
                    "message": f"Add a {section.lower()} section to improve ATS readability.",
                    "priority": "high",
                }
            )

        if keyword_gaps:
            suggestions.append(
                {
                    "type": "warning",
                    "section": "Keywords",
                    "message": f"Add role-relevant keywords such as {', '.join(keyword_gaps[:5])}.",
                    "priority": "high",
                }
            )

        if not any(skill.lower() in {candidate.lower() for candidate in extracted_skills} for skill in expected_skills_for_role(target_role)):
            suggestions.append(
                {
                    "type": "warning",
                    "section": "Skills",
                    "message": "Add backend technologies and tools that match the target role.",
                    "priority": "medium",
                }
            )

        for note in format_notes:
            suggestions.append(
                {
                    "type": "info",
                    "section": "Formatting",
                    "message": note,
                    "priority": "medium",
                }
            )

        return suggestions

    async def _generate_ai_suggestions(
        self,
        raw_text: str,
        target_role: str,
        ats_score: int,
        extracted_skills: List[str],
        keyword_gaps: List[str],
        section_scores: Dict[str, ResumeSectionScore],
        format_notes: List[str],
        user_id: str,
    ) -> List[Dict[str, Any]]:
        if settings.AI_MOCK_MODE:
            return self._build_rule_based_suggestions(
                target_role=target_role,
                extracted_skills=extracted_skills,
                keyword_gaps=keyword_gaps,
                section_scores=section_scores,
                format_notes=format_notes,
            )

        section_summary = {
            section: {
                "present": score.present,
                "score": score.score,
                "notes": score.notes,
            }
            for section, score in section_scores.items()
        }
        prompt = f"""
You are an ATS resume reviewer.
Return ONLY JSON with this shape:
{{
  "suggestions": [
    {{"type": "warning", "section": "Skills", "message": "Add backend technologies", "priority": "medium"}}
  ]
}}

Target role: {target_role}
ATS score: {ats_score}
Extracted skills: {', '.join(extracted_skills) or 'none'}
Missing keywords: {', '.join(keyword_gaps) or 'none'}
Format notes: {', '.join(format_notes) or 'none'}
Section summary: {json.dumps(section_summary)}

Resume text:
{scrub_pii(sanitize_input(raw_text))}
""".strip()

        try:
            payload = await llm_gateway.generate_json(prompt, user_id=user_id)
        except Exception:
            return self._build_rule_based_suggestions(
                target_role=target_role,
                extracted_skills=extracted_skills,
                keyword_gaps=keyword_gaps,
                section_scores=section_scores,
                format_notes=format_notes,
            )

        suggestions = payload.get("suggestions", []) if isinstance(payload, dict) else []
        if not isinstance(suggestions, list):
            return self._build_rule_based_suggestions(
                target_role=target_role,
                extracted_skills=extracted_skills,
                keyword_gaps=keyword_gaps,
                section_scores=section_scores,
                format_notes=format_notes,
            )

        normalized: List[Dict[str, Any]] = []
        for item in suggestions:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "type": item.get("type", "info"),
                    "section": item.get("section", "General"),
                    "message": item.get("message", "Review the resume content for ATS alignment."),
                    "priority": item.get("priority", "medium"),
                }
            )

        return normalized or self._build_rule_based_suggestions(
            target_role=target_role,
            extracted_skills=extracted_skills,
            keyword_gaps=keyword_gaps,
            section_scores=section_scores,
            format_notes=format_notes,
        )

    def _calculate_ats_score(
        self,
        raw_text: str,
        target_role: str,
        structured_text: Dict[str, Any],
        extracted_skills: List[str],
        job_description: str,
    ) -> Dict[str, Any]:
        role_comparison = semantic_matcher.compare(extracted_skills, target_role)
        expected_skills = role_comparison.get("expectedSkills", expected_skills_for_role(target_role))
        matched_skills = role_comparison.get("matchedSkills", [])
        missing_skills = role_comparison.get("missingSkills", [])
        job_keywords = self._extract_job_keywords(job_description)

        resume_tokens = {token.lower() for token in re.findall(r"[A-Za-z][A-Za-z0-9\+\.#/-]{1,30}", raw_text)}
        expected_tokens = {normalize_skill(skill).lower() for skill in expected_skills}
        job_tokens = {normalize_skill(skill).lower() for skill in job_keywords}

        keyword_expected_set = expected_tokens.union(job_tokens)
        keyword_matches = [token for token in keyword_expected_set if token in resume_tokens]
        missing_keywords = sorted({token for token in keyword_expected_set if token not in resume_tokens})

        keyword_match_score = int(round((len(keyword_matches) / max(len(keyword_expected_set), 1)) * 40))

        section_scores = self._compute_section_scores(structured_text)
        completed_sections = len([section for section, score in section_scores.items() if score.present])
        section_completeness_score = int(round((completed_sections / len(REQUIRED_SECTIONS)) * 20))

        format_quality = self._compute_format_score(raw_text, structured_text)
        format_quality_score = int(format_quality["score"])

        skill_match_score = int(round((len(matched_skills) / max(len(expected_skills), 1)) * 20))

        total_score = keyword_match_score + section_completeness_score + format_quality_score + skill_match_score
        ats_score = max(0, min(100, total_score))

        return {
            "atsScore": ats_score,
            "keywordMatchScore": keyword_match_score,
            "sectionCompletenessScore": section_completeness_score,
            "formatQualityScore": format_quality_score,
            "skillMatchScore": skill_match_score,
            "matchedSkills": matched_skills,
            "missingSkills": missing_skills,
            "missingKeywords": missing_keywords,
            "expectedSkills": expected_skills,
            "sectionScores": section_scores,
            "formatNotes": format_quality["notes"],
            "keywordGaps": missing_keywords,
        }

    async def _store_analysis(self, document: Dict[str, Any]) -> Dict[str, Any]:
        collection = self._get_collection()
        response_document = json.loads(json.dumps(document, default=str))
        stored_document = json.loads(json.dumps(response_document, default=str))
        await collection.insert_one(stored_document)
        return response_document

    async def analyze_resume_text(
        self,
        raw_text: str,
        user_id: str = "anonymous",
        target_role: Optional[str] = None,
        job_description: str = "",
        structured_text: Optional[Dict[str, Any]] = None,
        source: str = "direct",
        file_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        cleaned_text = sanitize_input(raw_text or "")
        if not cleaned_text:
            raise ValueError("Resume text is required")

        target_role_name = self._clean_role(target_role)
        structured = structured_text or self._fallback_sections(cleaned_text)
        cache_key = f"resume:analysis:{self._hash_payload(cleaned_text, target_role_name, job_description)}"

        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        extracted = nlp_pipeline.run(cleaned_text)
        extracted_skills = extracted.get("skills", []) or []
        skill_set = sorted({normalize_skill(skill) for skill in extracted_skills if normalize_skill(skill)})

        ats_metrics = self._calculate_ats_score(
            raw_text=cleaned_text,
            target_role=target_role_name,
            structured_text=structured,
            extracted_skills=skill_set,
            job_description=job_description,
        )
        section_scores = ats_metrics["sectionScores"]
        suggestions = await self._generate_ai_suggestions(
            raw_text=cleaned_text,
            target_role=target_role_name,
            ats_score=ats_metrics["atsScore"],
            extracted_skills=skill_set,
            keyword_gaps=ats_metrics["keywordGaps"],
            section_scores=section_scores,
            format_notes=ats_metrics["formatNotes"],
            user_id=user_id,
        )

        version = await self._get_next_version(user_id)
        report = ResumeAnalysisReport(
            analysisId=str(uuid.uuid4()),
            userId=user_id,
            targetRole=target_role_name,
            atsScore=ats_metrics["atsScore"],
            sectionScores=section_scores,
            suggestions=suggestions,
            extractedSkills=skill_set,
            keywordGaps=ats_metrics["keywordGaps"],
            rawText=cleaned_text,
            structuredText=structured,
            createdAt=datetime.utcnow(),
            source=source,
            jobDescription=job_description or None,
            fileName=file_name,
            analysisVersion=version,
        )

        document = report.model_dump(mode="json")
        document.update(
            {
                "keywordMatchScore": ats_metrics["keywordMatchScore"],
                "sectionCompletenessScore": ats_metrics["sectionCompletenessScore"],
                "formatQualityScore": ats_metrics["formatQualityScore"],
                "skillMatchScore": ats_metrics["skillMatchScore"],
                "matchedSkills": ats_metrics["matchedSkills"],
                "missingSkills": ats_metrics["missingSkills"],
                "expectedSkills": ats_metrics["expectedSkills"],
            }
        )

        document = await self._store_analysis(document)

        try:
            await redis_client.set(cache_key, json.dumps(document, default=str), ex=settings.RESUME_CACHE_SECONDS)
            await redis_client.set(f"resume:latest:{user_id}", json.dumps(document, default=str), ex=settings.RESUME_CACHE_SECONDS)
        except Exception:
            pass

        return document

    async def analyze_structured_resume(
        self,
        resume: Dict[str, Any],
        user_id: str = "anonymous",
        target_role: Optional[str] = None,
        job_description: str = "",
        source: str = "structured",
    ) -> Dict[str, Any]:
        structured_text = {
            "Summary": str(resume.get("summary") or ""),
            "Skills": ", ".join(str(item.get("name")) for item in resume.get("skills", []) if isinstance(item, dict)),
            "Experience": "\n\n".join(
                f"{item.get('role', '')}, {item.get('company', '')}\n"
                + "\n".join(f"- {bullet}" for bullet in item.get("bullets", []))
                for item in resume.get("experience", [])
                if isinstance(item, dict)
            ),
            "Projects": "\n\n".join(
                f"{item.get('name', '')}\n" + "\n".join(f"- {bullet}" for bullet in item.get("bullets", []))
                for item in resume.get("projects", [])
                if isinstance(item, dict)
            ),
            "Education": "\n".join(
                f"{item.get('degree', '')}, {item.get('institution', '')}"
                for item in resume.get("education", [])
                if isinstance(item, dict)
            ),
        }
        raw_text = "\n\n".join(f"{section}\n{text}" for section, text in structured_text.items() if text.strip())
        return await self.analyze_resume_text(
            raw_text=raw_text,
            user_id=user_id,
            target_role=target_role,
            job_description=job_description,
            structured_text=structured_text,
            source=source,
            file_name=None,
        )

    async def rewrite_section(
        self,
        section_text: str,
        role: str,
        section_name: str,
        user_id: str = "anonymous",
    ) -> Dict[str, Any]:
        cleaned_section = sanitize_input(section_text or "")
        if not cleaned_section:
            raise ValueError("Section text is required")

        cleaned_role = self._clean_role(role)
        if settings.AI_MOCK_MODE:
            keywords = expected_skills_for_role(cleaned_role)
            rewritten_text = f"{cleaned_section.strip()}\n\nOptimized for {cleaned_role} with focus on: {', '.join(keywords[:5])}."
            return {
                "sectionName": section_name,
                "role": cleaned_role,
                "rewrittenText": rewritten_text,
                "atsOptimizedText": rewritten_text,
                "keywordsAdded": keywords[:5],
                "suggestions": [
                    "Use stronger action verbs",
                    "Add measurable impact",
                    "Align wording with ATS keywords",
                ],
            }

        prompt = f"""
Rewrite the resume section below for ATS optimization.
Return ONLY JSON with keys: rewrittenText, atsOptimizedText, keywordsAdded, suggestions.

Role: {cleaned_role}
Section: {section_name}
Section text:
{scrub_pii(cleaned_section)}
""".strip()

        try:
            payload = await llm_gateway.generate_json(prompt, user_id=user_id)
        except Exception:
            keywords = expected_skills_for_role(cleaned_role)
            rewritten_text = f"{cleaned_section.strip()}\n\nOptimized for {cleaned_role} with focus on: {', '.join(keywords[:5])}."
            return {
                "sectionName": section_name,
                "role": cleaned_role,
                "rewrittenText": rewritten_text,
                "atsOptimizedText": rewritten_text,
                "keywordsAdded": keywords[:5],
                "suggestions": [
                    "Use stronger action verbs",
                    "Add measurable impact",
                    "Align wording with ATS keywords",
                ],
            }

        return {
            "sectionName": section_name,
            "role": cleaned_role,
            "rewrittenText": payload.get("rewrittenText", cleaned_section),
            "atsOptimizedText": payload.get("atsOptimizedText", payload.get("rewrittenText", cleaned_section)),
            "keywordsAdded": payload.get("keywordsAdded", []),
            "suggestions": payload.get("suggestions", []),
        }

    async def get_latest_analysis(self, user_id: str = "anonymous") -> Dict[str, Any]:
        try:
            cached = await redis_client.get(f"resume:latest:{user_id}")
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        collection = self._get_collection()
        document = await collection.find_one({"userId": user_id}, sort=[("createdAt", -1)])
        if not document:
            raise ValueError("No resume analysis found")
        document["_id"] = str(document["_id"])
        return document

    def _extract_name(self, raw_text: str) -> str:
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        if not lines:
            return ""

        first_line = re.sub(r"[^A-Za-z\s.'-]", " ", lines[0]).strip()
        words = [part for part in first_line.split() if part]
        if 1 < len(words) <= 5:
            return " ".join(words)
        return ""

    def _split_bullet_lines(self, section_text: str) -> List[str]:
        if not section_text:
            return []

        items: List[str] = []
        for raw_line in re.split(r"\n|•|- ", section_text):
            cleaned = sanitize_input(raw_line).strip(" -•\t")
            if cleaned:
                items.append(cleaned)
        return items

    def _parse_experience_entries(self, section_text: str) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        for item in self._split_bullet_lines(section_text):
            entries.append({"summary": item})
        return entries[:12]

    def _parse_education_entries(self, section_text: str) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        for item in self._split_bullet_lines(section_text):
            entries.append({"summary": item})
        return entries[:8]

    def _compute_resume_completeness(self, structured_text: Dict[str, Any]) -> int:
        section_scores = self._compute_section_scores(structured_text)
        completed_sections = len([section for section, score in section_scores.items() if score.present])
        return int(round((completed_sections / len(REQUIRED_SECTIONS)) * 100))

    async def _cleanup_structured_resume_with_llm(
        self,
        raw_text: str,
        structured_text: Dict[str, Any],
        extracted_skills: List[str],
        user_id: str,
    ) -> Dict[str, Any]:
        fallback = {
            "name": self._extract_name(raw_text),
            "skills": extracted_skills,
            "experience": self._parse_experience_entries(structured_text.get("Experience", "")),
            "education": self._parse_education_entries(structured_text.get("Education", "")),
            "projects": self._parse_experience_entries(structured_text.get("Projects", "")),
            "certifications": [],
            "contact": {},
        }

        if settings.AI_MOCK_MODE:
            return fallback

        prompt = f"""
You are a resume structuring assistant.
Return ONLY JSON with this exact schema:
{{
  "name": "",
  "skills": [""],
  "experience": [{{"summary": ""}}],
  "education": [{{"summary": ""}}],
  "projects": [{{"summary": ""}}],
  "certifications": [""],
  "contact": {{}}
}}

Extracted skills: {json.dumps(extracted_skills)}
Detected sections: {json.dumps(structured_text)}
Resume text:
{scrub_pii(raw_text)}
""".strip()

        try:
            payload = await llm_gateway.generate_json(prompt, user_id=user_id)
        except Exception:
            return fallback

        if not isinstance(payload, dict):
            return fallback

        return {
            "name": str(payload.get("name") or fallback["name"]),
            "skills": [str(item) for item in payload.get("skills", []) if str(item).strip()] or fallback["skills"],
            "experience": payload.get("experience", fallback["experience"]) if isinstance(payload.get("experience", fallback["experience"]), list) else fallback["experience"],
            "education": payload.get("education", fallback["education"]) if isinstance(payload.get("education", fallback["education"]), list) else fallback["education"],
            "projects": payload.get("projects", fallback["projects"]) if isinstance(payload.get("projects", fallback["projects"]), list) else fallback["projects"],
            "certifications": [str(item) for item in payload.get("certifications", []) if str(item).strip()] if isinstance(payload.get("certifications", []), list) else [],
            "contact": payload.get("contact", {}) if isinstance(payload.get("contact", {}), dict) else {},
        }

    async def build_centralized_resume_payload(
        self,
        raw_text: str,
        structured_text: Dict[str, Any],
        target_role: Optional[str],
        user_id: str,
    ) -> Dict[str, Any]:
        extracted = nlp_pipeline.run(raw_text)
        normalized_skills = sorted({normalize_skill(skill) for skill in extracted.get("skills", []) if normalize_skill(skill)})
        effective_role = self._clean_role(target_role or extracted.get("roleHint"))
        llm_cleaned = await self._cleanup_structured_resume_with_llm(raw_text, structured_text, normalized_skills, user_id)
        semantic = semantic_matcher.compare(llm_cleaned.get("skills", normalized_skills), effective_role)

        completeness_score = self._compute_resume_completeness(structured_text)
        metadata = {
            "sections": structured_text,
            "experienceYears": extracted.get("experienceYears", 0),
            "roleHint": extracted.get("roleHint", ""),
            "parsedAt": datetime.utcnow().isoformat(),
        }

        return {
            "name": llm_cleaned.get("name", ""),
            "skills": llm_cleaned.get("skills", normalized_skills),
            "experience": llm_cleaned.get("experience", []),
            "education": llm_cleaned.get("education", []),
            "projects": llm_cleaned.get("projects", []),
            "certifications": llm_cleaned.get("certifications", []),
            "contact": llm_cleaned.get("contact", {}),
            "completenessScore": completeness_score,
            "skillGapDetection": {
                "targetRole": effective_role,
                "matchedSkills": [str(item) for item in semantic.get("matchedSkills", [])],
                "missingSkills": [str(item) for item in semantic.get("missingSkills", [])],
            },
            "metadata": metadata,
        }

    async def get_stored_resume(self, user_id: str) -> Dict[str, Any]:
        resume = await user_resume_store.get_current_resume(user_id)
        if not resume:
            raise ValueError("No stored resume found")
        return resume

    async def analyze_stored_resume(
        self,
        user_id: str,
        target_role: Optional[str] = None,
        job_description: str = "",
    ) -> Dict[str, Any]:
        stored_resume = await self.get_stored_resume(user_id)
        raw_text = sanitize_input(str(stored_resume.get("raw_text") or ""))
        if not raw_text:
            raise ValueError("Stored resume has not finished parsing yet")

        structured_resume = stored_resume.get("structured_resume") or {}
        sections = stored_resume.get("structured_text") or {}
        metadata = structured_resume.get("metadata", {}) if isinstance(structured_resume, dict) else {}
        if isinstance(metadata, dict):
            sections = sections or metadata.get("sections", {}) or {}

        if not sections and isinstance(structured_resume, dict):
            sections = {
                "Summary": structured_resume.get("summary", ""),
                "Experience": "\n".join("\n".join(str(bullet) for bullet in item.get("bullets", [])) for item in structured_resume.get("experience", []) if isinstance(item, dict)),
                "Skills": ", ".join(str(item.get("name", item)) for item in structured_resume.get("skills", [])),
                "Projects": "\n".join("\n".join(str(bullet) for bullet in item.get("bullets", [])) for item in structured_resume.get("projects", []) if isinstance(item, dict)),
                "Education": "\n".join(str(item.get("degree", "")) for item in structured_resume.get("education", []) if isinstance(item, dict)),
            }

        return await self.analyze_resume_text(
            raw_text=raw_text,
            user_id=user_id,
            target_role=target_role,
            job_description=job_description,
            structured_text=sections,
            source="stored-resume",
            file_name=None,
        )

    async def process_queue_job(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        user_id = payload.get("userId", "anonymous")
        target_role = payload.get("targetRole")
        job_description = payload.get("jobDescription", "")
        file_name = payload.get("fileName")
        source = payload.get("source", "queue")

        if payload.get("resumeText"):
            return await self.analyze_resume_text(
                raw_text=payload["resumeText"],
                user_id=user_id,
                target_role=target_role,
                job_description=job_description,
                structured_text=payload.get("structuredText"),
                source=source,
                file_name=file_name,
            )

        if payload.get("structuredResume"):
            return await self.analyze_structured_resume(
                resume=payload["structuredResume"],
                user_id=user_id,
                target_role=target_role,
                job_description=job_description,
                source=source,
            )

        raise ValueError("Queue job payload must include structuredResume or resumeText")

    async def _get_next_version(self, user_id: str) -> int:
        collection = self._get_collection()
        count = await collection.count_documents({"userId": user_id})
        return count + 1


resume_service = ResumeService()
