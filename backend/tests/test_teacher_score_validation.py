import unittest

from pydantic import ValidationError
from schemas.scheduling import TeacherScoreEventCreate


class ScoreValidationTests(unittest.TestCase):
    def test_evidence_is_optional_for_both_score_directions(self):
        for delta in (-5, 3):
            for evidence in ({}, {"evidence_text": None, "evidence_url": None},
                             {"evidence_text": "  ", "evidence_url": "  "}):
                event = TeacherScoreEventCreate(score_month="2026-10-01", delta=delta,
                                                reason="  Attendance  ", **evidence)
                self.assertEqual(event.reason, "Attendance")
                self.assertIsNone(event.evidence_text)
                self.assertIsNone(event.evidence_url)

    def test_reason_is_required_even_with_evidence(self):
        for reason in (None, "", "   "):
            with self.assertRaises(ValidationError):
                TeacherScoreEventCreate(score_month="2026-10-01", delta=-5,
                                        reason=reason, evidence_text="Evidence")
