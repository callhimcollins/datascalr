from pydantic import BaseModel


class EndpointConfig(BaseModel):
    method: str
    path: str
    description: str
    weight: float
    body_template: dict | None = None


class GenerateConfigRequest(BaseModel):
    platform: str
    concurrency: int = 10
    ramp_up: int = 5
    duration: int = 30


class GenerateConfigResponse(BaseModel):
    base_url: str
    endpoints: list[EndpointConfig]
