from pydantic import BaseModel


class StartRunRequest(BaseModel):
    parent_id: str
    base_url: str
    endpoints: list[dict]
    concurrency: int
    ramp_up: int
    duration: int
    platform: str = ""
    profile_label: str = ""


class StartRunResponse(BaseModel):
    run_id: str
    status: str
