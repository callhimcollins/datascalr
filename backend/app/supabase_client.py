from __future__ import annotations

import os

import httpx

BASE_URL = os.environ["SUPABASE_URL"] + "/rest/v1"
HEADERS = {
    "apikey": os.environ["SUPABASE_SERVICE_KEY"],
    "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_KEY']}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


async def insert(table: str, data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/{table}",
            json=data,
            headers={**HEADERS, "Prefer": "return=representation"},
        )
        resp.raise_for_status()
        return resp.json()[0]


async def update(table: str, id_col: str, id_val: str, data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{BASE_URL}/{table}?{id_col}=eq.{id_val}",
            json=data,
            headers={**HEADERS, "Prefer": "return=representation"},
        )
        resp.raise_for_status()
        result = resp.json()
        return result[0] if result else {}


async def get(table: str, id_col: str, id_val: str) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/{table}?{id_col}=eq.{id_val}&select=*",
            headers=HEADERS,
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None


async def delete(table: str, id_col: str, id_val: str) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{BASE_URL}/{table}?{id_col}=eq.{id_val}",
            headers=HEADERS,
        )
        resp.raise_for_status()


async def list_all(table: str, order: str = "created_at.desc", limit: int = 50, columns: str = "*") -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/{table}?order={order}&limit={limit}&select={columns}",
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()
