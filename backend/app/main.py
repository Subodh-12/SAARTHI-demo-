
from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="SAARTHI API",
    description="Offline-first, Odia-first learning system",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "project": "SAARTHI",
    }


@app.get("/")
def home():
    return {
        "message": "Welcome to SAARTHI",
        "status": "running",
    }


@app.get("/api/lesson")
def get_lesson():
    return {
        "id": "science-intro-001",
        "title": "ବିଜ୍ଞାନ ଶିଖିବା",
        "subtitle": "ଆସ, ଆଜି ଶିଖିବା!",
        "question": "ବିଜ୍ଞାନ ଶିଖିବାର ଗୋଟିଏ ମୁଖ୍ୟ ଉଦ୍ଦେଶ୍ୟ କ'ଣ?",
        "options": [
            "କେବଳ ଉତ୍ତର ମନେ ରଖିବା",
            "ପ୍ରକୃତି ଓ ଘଟଣାକୁ ବୁଝିବା",
            "କେବଳ ପରୀକ୍ଷା ଦେବା",
        ],
        "correct_option": 1,
        "explanation": (
            "ବିଜ୍ଞାନ ଆମକୁ ପ୍ରକୃତି ଓ ବିଭିନ୍ନ ଘଟଣାକୁ "
            "ପର୍ଯ୍ୟବେକ୍ଷଣ ଓ ପ୍ରମାଣ ମାଧ୍ୟମରେ ବୁଝିବାରେ "
            "ସାହାଯ୍ୟ କରେ।"
        ),
    }
