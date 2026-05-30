import uuid

from fastapi import APIRouter, HTTPException

from ..schemas.run import StartRunRequest, StartRunResponse
from ..supabase_client import insert, get, update, delete as delete_row, list_all

router = APIRouter()

# In-memory cache for active run metrics during streaming
active_runs: dict[str, dict] = {}


@router.post("/api/runs", response_model=StartRunResponse)
async def start_run(req: StartRunRequest):
    run_id = str(uuid.uuid4())[:8]
    run_data = {
        "id": run_id,
        "parent_id": req.parent_id,
        "profile_label": req.profile_label,
        "status": "running",
        "concurrency": req.concurrency,
        "ramp_up": req.ramp_up,
        "duration": req.duration,
    }
    await insert("simulation_runs", run_data)
    active_runs[run_id] = {
        "status": "running",
        "config": req.model_dump(),
        "metrics": [],
    }
    return StartRunResponse(run_id=run_id, status="running")


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    row = await get("simulation_runs", "id", run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run_id": run_id, "status": row["status"], "config": row, "metrics": row.get("metrics") or []}


@router.get("/api/runs")
async def list_runs():
    rows = await list_all(
        "simulation_runs",
        order="started_at.desc",
        limit=50,
        columns="id,parent_id,profile_label,status,concurrency,ramp_up,duration,avg_cache_ms,avg_no_cache_ms,comparison,analysis,error_count,started_at,completed_at",
    )
    return rows


@router.get("/api/parents")
async def list_parents():
    rows = await list_all("simulation_parents", order="created_at.desc", limit=20)
    return rows


@router.delete("/api/runs/{run_id}")
async def delete_run(run_id: str):
    existing = await get("simulation_runs", "id", run_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Run not found")
    await delete_row("simulation_runs", "id", run_id)
    active_runs.pop(run_id, None)
    return {"deleted": run_id}
