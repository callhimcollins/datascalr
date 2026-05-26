import uuid

from fastapi import APIRouter

from ..schemas.run import StartRunRequest, StartRunResponse

router = APIRouter()

runs: dict[str, dict] = {}


@router.post("/api/runs", response_model=StartRunResponse)
async def start_run(req: StartRunRequest):
    run_id = str(uuid.uuid4())[:8]
    runs[run_id] = {
        "status": "running",
        "config": req.model_dump(),
        "metrics": [],
    }
    return StartRunResponse(run_id=run_id, status="running")


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    run = runs.get(run_id)
    if not run:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, **run}
