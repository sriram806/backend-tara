from app.services.skill_dictionary import expected_skills_for_role, normalize_skill


def test_normalize_skill_maps_synonyms():
    assert normalize_skill('nodejs') == 'Node.js'
    assert normalize_skill('reactjs') == 'React'


def test_expected_skills_for_known_role():
    skills = expected_skills_for_role('backend engineer')
    lowered = {item.lower() for item in skills}
    assert 'python' in lowered
    assert 'rest apis' in lowered


def test_expected_skills_for_unknown_role_uses_default():
    skills = expected_skills_for_role('quantum architect')
    assert 'Python' in skills
    assert 'System Design' in skills
