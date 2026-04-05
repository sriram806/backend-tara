from typing import Dict, List, Set

SKILL_SYNONYMS: Dict[str, str] = {
    "reactjs": "React",
    "react.js": "React",
    "nodejs": "Node.js",
    "node": "Node.js",
    "expressjs": "Express.js",
    "postgres": "PostgreSQL",
    "mongo": "MongoDB",
    "k8s": "Kubernetes",
    "ts": "TypeScript",
    "js": "JavaScript",
    "py": "Python",
    "aws cloud": "AWS",
    "gcp cloud": "GCP",
    "azure cloud": "Azure",
    "ci cd": "CI/CD",
}

CANONICAL_SKILLS: Set[str] = {
    "Python",
    "Java",
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "Express.js",
    "FastAPI",
    "Django",
    "Flask",
    "PostgreSQL",
    "MongoDB",
    "Redis",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "CI/CD",
    "Microservices",
    "REST APIs",
    "GraphQL",
    "System Design",
    "Machine Learning",
    "NLP",
}

ROLE_SKILLS: Dict[str, List[str]] = {
    "backend engineer": [
        "Python",
        "Node.js",
        "REST APIs",
        "PostgreSQL",
        "Docker",
        "CI/CD",
        "Microservices",
    ],
    "frontend engineer": [
        "JavaScript",
        "TypeScript",
        "React",
        "CI/CD",
    ],
    "full stack engineer": [
        "JavaScript",
        "TypeScript",
        "React",
        "Node.js",
        "PostgreSQL",
        "Docker",
        "CI/CD",
    ],
    "data scientist": [
        "Python",
        "Machine Learning",
        "NLP",
        "Docker",
    ],
    "devops engineer": [
        "Docker",
        "Kubernetes",
        "AWS",
        "CI/CD",
        "Microservices",
    ],
}


def normalize_skill(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""

    key = cleaned.lower().replace("-", " ").replace("_", " ").replace(".", ".")
    canonical = SKILL_SYNONYMS.get(key)
    if canonical:
        return canonical

    for skill in CANONICAL_SKILLS:
        if skill.lower() == cleaned.lower():
            return skill

    return cleaned


def expected_skills_for_role(role: str) -> List[str]:
    role_key = (role or "").strip().lower()
    if role_key in ROLE_SKILLS:
        return ROLE_SKILLS[role_key]
    return ["Python", "REST APIs", "Docker", "CI/CD", "System Design"]
