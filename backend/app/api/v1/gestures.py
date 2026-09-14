from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_gestures():
    return {
        "gestures": [
            {
                "id": "yes",
                "name": "YES",
                "description": "Head nodding yes gesture",
                "type": "predefined",
            },
            {
                "id": "no",
                "name": "NO",
                "description": "Head shaking no gesture",
                "type": "predefined",
            },
        ]
    }
