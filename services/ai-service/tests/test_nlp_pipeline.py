from app.services.nlp_pipeline import NLPPipeline


def test_clean_text_normalizes_whitespace():
    pipeline = NLPPipeline()
    cleaned = pipeline.clean_text('  hello\n\nworld   ')
    assert cleaned == 'hello world'


def test_extract_role_hint_detects_role():
    pipeline = NLPPipeline()
    role = pipeline.extract_role_hint('I worked as a backend engineer for 4 years')
    assert role == 'Backend Engineer'


def test_extract_experience_years_parses_numeric_years():
    pipeline = NLPPipeline()
    years = pipeline.extract_experience_years('I have 7 years of experience in software engineering')
    assert years == 7


def test_extract_skills_detects_common_stack_items():
    pipeline = NLPPipeline()
    skills = pipeline.extract_skills('Built APIs with Python, FastAPI, and PostgreSQL on AWS')
    lowered = {item.lower() for item in skills}
    assert 'python' in lowered
    assert 'fastapi' in lowered
    assert 'postgresql' in lowered
