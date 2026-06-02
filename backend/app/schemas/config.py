from enum import Enum

from pydantic import BaseModel


class ConfigMode(str, Enum):
    cache_comparison = "cache_comparison"
    rate_limiting = "rate_limiting"


class ProfileEndpoint(BaseModel):
    method: str
    path: str
    description: str
    weight: float


class Profile(BaseModel):
    label: str
    description: str
    endpoints: list[ProfileEndpoint]


class GenerateConfigRequest(BaseModel):
    platform: str
    concurrency: int = 10
    ramp_up: int = 5
    duration: int = 30
    mode: ConfigMode = ConfigMode.cache_comparison
    rate_limit_rps: int | None = None


class GenerateConfigResponse(BaseModel):
    parent_id: str
    base_url: str
    profiles: list[Profile]
