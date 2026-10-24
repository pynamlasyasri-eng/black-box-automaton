"""FastAPI application. Interactive API docs are served at /docs (Swagger) and /redoc."""
import os
from typing import List, Literal, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .db import Database
from .services import ExperimentService, ServiceError


class SPAStaticFiles(StaticFiles):
    """Serve the built React app; unknown non-API paths fall back to index.html (client-side routing)."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not path.startswith("api/"):
                return await super().get_response("index.html", scope)
            raise


class ExperimentCreate(BaseModel):
    machine_id: str = Field(..., description="Id of a mystery machine from GET /api/machines")
    name: Optional[str] = Field(None, max_length=80)


class QueryRequest(BaseModel):
    input: str = Field("", max_length=64, description="String to test; the empty string is allowed")


class BatchQueryRequest(BaseModel):
    inputs: List[str] = Field(..., max_length=200)


class DiscoverRequest(BaseModel):
    method: Literal["lstar", "passive"] = "lstar"
    max_test_len: int = Field(4, ge=0, le=8, description="L* only: test every string up to this length")


class RefineRequest(BaseModel):
    candidate_id: int
    counterexample: str = Field("", max_length=64)


class TraceRequest(BaseModel):
    input: str = Field("", max_length=64)


class ValidateRequest(BaseModel):
    candidate_id: int
    max_len: int = Field(5, ge=0, le=8)
    n_random: int = Field(30, ge=0, le=200)
    extra_inputs: List[str] = Field(default_factory=list, max_length=50)


def create_app(db_path: Optional[str] = None) -> FastAPI:
    db = Database(db_path or config.DB_PATH)
    db.init_schema()
    svc = ExperimentService(db)

    app = FastAPI(
        title="Black Box Automaton API",
        version="1.0.0",
        description="REST API for black-box DFA experiments, L* / RPNI inference and validation. "
                    "Hidden machine definitions are never returned until an experiment is revealed.",
    )
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                       allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(ServiceError)
    async def service_error_handler(_request, exc: ServiceError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.message})

    api = APIRouter(prefix="/api", tags=["api"])

    @api.get("/health")
    def health():
        return {"status": "ok"}

    @api.get("/machines", summary="List mystery machines (public metadata only)")
    def machines():
        return svc.machines()

    @api.get("/stats", summary="Aggregate counts shown on the dashboard")
    def stats():
        return svc.stats()

    @api.post("/experiments", status_code=201, summary="Start a new experiment")
    def create_experiment(body: ExperimentCreate):
        return svc.create_experiment(body.machine_id, body.name)

    @api.get("/experiments", summary="List saved experiments")
    def list_experiments():
        return svc.list_experiments()

    @api.delete("/experiments", summary="Delete ALL experiments (requires ?confirm=true)")
    def delete_all(confirm: bool = Query(False)):
        if not confirm:
            raise HTTPException(status_code=400, detail="Pass confirm=true to delete all history")
        return {"deleted": svc.delete_all()}

    @api.get("/experiments/{exp_id}", summary="Full experiment: observations, candidates, validations")
    def get_experiment(exp_id: int):
        return svc.experiment_detail(exp_id)

    @api.delete("/experiments/{exp_id}", summary="Delete one experiment")
    def delete_experiment(exp_id: int):
        svc.delete_experiment(exp_id)
        return {"deleted": exp_id}

    @api.post("/experiments/{exp_id}/query", summary="Membership query: ACCEPTED or REJECTED?")
    def query(exp_id: int, body: QueryRequest):
        return svc.query(exp_id, body.input)

    @api.post("/experiments/{exp_id}/query-batch", summary="Query several strings at once")
    def query_batch(exp_id: int, body: BatchQueryRequest):
        return svc.query_many(exp_id, body.inputs)

    @api.post("/experiments/{exp_id}/discover", status_code=201,
              summary="Infer a candidate DFA (L* or passive RPNI)")
    def discover(exp_id: int, body: DiscoverRequest):
        return svc.discover(exp_id, body.method, body.max_test_len)

    @api.post("/experiments/{exp_id}/refine", status_code=201,
              summary="Submit a counterexample and re-learn the candidate")
    def refine(exp_id: int, body: RefineRequest):
        return svc.refine(exp_id, body.candidate_id, body.counterexample)

    @api.post("/experiments/{exp_id}/candidates/{cand_id}/trace",
              summary="Step-by-step run of a candidate on a string")
    def trace(exp_id: int, cand_id: int, body: TraceRequest):
        return svc.trace(exp_id, cand_id, body.input)

    @api.post("/experiments/{exp_id}/validate", status_code=201,
              summary="Compare a candidate with the black box on generated test strings")
    def validate(exp_id: int, body: ValidateRequest):
        return svc.validate(exp_id, body.candidate_id, body.max_len, body.n_random, body.extra_inputs)

    @api.post("/experiments/{exp_id}/reveal",
              summary="Reveal the secret rule and exactly check every candidate against it")
    def reveal(exp_id: int):
        return svc.reveal(exp_id)

    app.include_router(api)

    # Optional single-process deployment: serve the built React app.
    if os.path.isdir(config.FRONTEND_DIST):
        app.mount("/", SPAStaticFiles(directory=config.FRONTEND_DIST, html=True), name="ui")
    return app


app = create_app()
