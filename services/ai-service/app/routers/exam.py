from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.services.llm_gateway import llm_gateway

router = APIRouter(prefix="/ai/exam", tags=["Exam AI"])

class QuestionGenerationRequest(BaseModel):
    skillName: str
    difficulty: int = Field(default=3, ge=1, le=5)
    count: int = Field(default=5, ge=1, le=20)
    type: Optional[str] = "MCQ" # MCQ, FILL, CODE

@router.post("/generate-questions")
async def generate_questions(req: QuestionGenerationRequest):
    try:
        difficulty_label = "Easy" if req.difficulty <= 2 else "Intermediate" if req.difficulty <= 4 else "Hard"
        
        prompt = f"""
        Generate {req.count} {req.type} questions for the skill '{req.skillName}' at {difficulty_label} difficulty.
        
        Return ONLY a JSON object with a 'questions' key containing an array of questions.
        Each question should have:
        - type: "{req.type}"
        - question: "The question text"
        - answer: "The correct answer"
        - explanation: "Brief explanation"
        - difficulty: {req.difficulty}
        - marks: {req.difficulty}
        """

        if req.type == "MCQ":
            prompt += """
            - options: ["Option A", "Option B", "Option C", "Option D"]
            """
        elif req.type == "FILL":
            prompt += """
            - placeholder: "e.g. Type your answer here..."
            """
        elif req.type == "CODE":
            prompt += """
            - language: "The programming language"
            - starterCode: "Initial code snippet"
            """

        result = await llm_gateway.generate_json(prompt)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
