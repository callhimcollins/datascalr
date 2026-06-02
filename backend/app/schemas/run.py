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
    mode: str = "cache_comparison"
    rate_limit_rps: int | None = None


class StartRunResponse(BaseModel):
    run_id: str
    status: str
