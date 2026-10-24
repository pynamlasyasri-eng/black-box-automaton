"""HTTP-level tests. Skipped automatically if fastapi/httpx are not installed."""
import os
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    from app.main import create_app
    HAVE_API = True
except Exception:  # pragma: no cover
    HAVE_API = False


@unittest.skipUnless(HAVE_API, "fastapi and httpx are required for API tests")
class ApiTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.client = TestClient(create_app(os.path.join(self._dir.name, "api.db")))

    def tearDown(self):
        self._dir.cleanup()

    def test_machines_hide_secrets(self):
        r = self.client.get("/api/machines")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.json()), 5)
        for m in r.json():
            self.assertEqual(set(m), {"id", "name", "alphabet", "difficulty"})

    def test_full_flow(self):
        c = self.client
        exp = c.post("/api/experiments", json={"machine_id": "beta"}).json()
        eid = exp["id"]
        self.assertEqual(c.post(f"/api/experiments/{eid}/query", json={"input": "101"}).json()["label"], "ACCEPTED")
        self.assertEqual(c.post(f"/api/experiments/{eid}/query", json={"input": ""}).json()["label"], "REJECTED")
        bad = c.post(f"/api/experiments/{eid}/query", json={"input": "abc"})
        self.assertEqual(bad.status_code, 422)
        self.assertIn("alphabet", bad.json()["detail"])
        cand = c.post(f"/api/experiments/{eid}/discover", json={"method": "lstar", "max_test_len": 4}).json()
        self.assertEqual(len(cand["dfa"]["states"]), 3)
        val = c.post(f"/api/experiments/{eid}/validate", json={"candidate_id": cand["id"]}).json()
        self.assertEqual(val["summary"]["agreement"], 1.0)
        tr = c.post(f"/api/experiments/{eid}/candidates/{cand['id']}/trace", json={"input": "01"}).json()
        self.assertEqual(tr["label"], "ACCEPTED")
        rev = c.post(f"/api/experiments/{eid}/reveal").json()
        self.assertTrue(rev["candidate_checks"][0]["equivalent"])

    def test_errors_and_delete_confirmation(self):
        c = self.client
        self.assertEqual(c.get("/api/experiments/42").status_code, 404)
        self.assertEqual(c.post("/api/experiments", json={"machine_id": "zzz"}).status_code, 404)
        self.assertEqual(c.delete("/api/experiments").status_code, 400)
        self.assertEqual(c.delete("/api/experiments?confirm=true").status_code, 200)
        self.assertEqual(c.post("/api/experiments/1/discover", json={"method": "bogus"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
