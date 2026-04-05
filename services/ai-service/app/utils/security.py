import re

def scrub_pii(text: str) -> str:
    """
    Remove basic PII from text before sending to LLMs.
    """
    if not text:
        return text

    # Remove emails
    text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '[EMAIL REDACTED]', text)
    
    # Remove simple phone number patterns (very basic example)
    text = re.sub(r'\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', '[PHONE REDACTED]', text)
    
    # Example aadhaar or social security mock scrubbing
    text = re.sub(r'\b\d{4}\s\d{4}\s\d{4}\b', '[ID REDACTED]', text)

    return text

def sanitize_input(text: str) -> str:
    """
    Sanitize general strings.
    """
    if not text:
         return text
    # Basic protection against prompt injection prefixes
    # E.g. Disallow "Ignore all prior instructions" -> though LLMs are better handle this now, 
    # structured prompting is the primary defense.
    sanitized = text.replace("Ignore previous instructions", "")
    return scrub_pii(sanitized)
