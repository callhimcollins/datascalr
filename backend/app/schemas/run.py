from pydantic import BaseModel


class StartRunRequest(BaseModel):
    base_url: str
    endpoints: list[dict]
    concurrency: int
    ramp_up: int
    duration: int


class StartRunResponse(BaseModel):
    run_id: str
    status: str
