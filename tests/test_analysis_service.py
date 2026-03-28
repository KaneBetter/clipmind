"""Tests for the Gemini video analysis service."""

import json
from unittest.mock import MagicMock, patch

import pytest

from clipmind.services.analysis import (
    ANALYSIS_PROMPT,
    calculate_usage_cost,
    estimate_batch_cost,
    estimate_cost,
    extract_json_from_text,
    parse_gemini_response,
    analyze_video,
)


class TestExtractJsonFromText:
    """Test JSON extraction from various Gemini response formats."""

    def test_clean_json(self):
        raw = json.dumps({"scene_category": "landscape", "quality_score": 8.0})
        result = extract_json_from_text(raw)
        assert result["scene_category"] == "landscape"

    def test_json_in_markdown_code_block(self):
        raw = '```json\n{"scene_category": "food", "quality_score": 7.5}\n```'
        result = extract_json_from_text(raw)
        assert result["scene_category"] == "food"
        assert result["quality_score"] == 7.5

    def test_json_in_bare_code_block(self):
        raw = '```\n{"scene_category": "people"}\n```'
        result = extract_json_from_text(raw)
        assert result["scene_category"] == "people"

    def test_json_with_surrounding_text(self):
        raw = 'Here is the analysis:\n{"scene_category": "cityscape", "quality_score": 6}\nHope this helps!'
        result = extract_json_from_text(raw)
        assert result["scene_category"] == "cityscape"

    def test_invalid_json_raises(self):
        with pytest.raises(ValueError, match="Could not extract valid JSON"):
            extract_json_from_text("this is not json at all")

    def test_empty_string_raises(self):
        with pytest.raises(ValueError):
            extract_json_from_text("")


class TestParseGeminiResponse:
    """Test parsing and validation of Gemini responses."""

    def _make_response(self, **overrides) -> str:
        base = {
            "scene_category": "landscape",
            "quality_score": 8.5,
            "is_highlight": True,
            "mood": "epic",
            "description": "壮观的山脉风景",
            "people_count": 0,
            "audio_type": "wind",
            "issues": "none",
            "segments": [{"start_sec": 0, "end_sec": 5, "label": "全景"}],
        }
        base.update(overrides)
        return json.dumps(base)

    def test_valid_response(self):
        result = parse_gemini_response(self._make_response())
        assert result["scene_category"] == "landscape"
        assert result["quality_score"] == 8.5
        assert result["is_highlight"] is True
        assert result["mood"] == "epic"
        assert result["description"] == "壮观的山脉风景"
        assert result["people_count"] == 0
        assert result["audio_type"] == "wind"
        assert result["issues"] == "none"
        assert len(result["segments"]) == 1
        assert result["segments"][0]["label"] == "全景"

    def test_invalid_scene_category_defaults_to_other(self):
        result = parse_gemini_response(self._make_response(scene_category="invalid"))
        assert result["scene_category"] == "other"

    def test_invalid_mood_defaults_to_other(self):
        result = parse_gemini_response(self._make_response(mood="angry"))
        assert result["mood"] == "other"

    def test_invalid_audio_type_defaults_to_other(self):
        result = parse_gemini_response(self._make_response(audio_type="thunder"))
        assert result["audio_type"] == "other"

    def test_quality_score_clamped_to_range(self):
        result = parse_gemini_response(self._make_response(quality_score=15.0))
        assert result["quality_score"] == 10.0

        result = parse_gemini_response(self._make_response(quality_score=-2.0))
        assert result["quality_score"] == 1.0

    def test_quality_score_non_numeric_defaults(self):
        result = parse_gemini_response(self._make_response(quality_score="high"))
        assert result["quality_score"] == 5.0

    def test_is_highlight_string_true(self):
        result = parse_gemini_response(self._make_response(is_highlight="true"))
        assert result["is_highlight"] is True

    def test_is_highlight_string_false(self):
        result = parse_gemini_response(self._make_response(is_highlight="false"))
        assert result["is_highlight"] is False

    def test_people_count_non_numeric_defaults(self):
        result = parse_gemini_response(self._make_response(people_count="many"))
        assert result["people_count"] == 0

    def test_issues_list_format(self):
        result = parse_gemini_response(self._make_response(issues=["shaky", "blurry"]))
        assert result["issues"] == "shaky,blurry"

    def test_issues_invalid_values_filtered(self):
        result = parse_gemini_response(self._make_response(issues="shaky,invalid,blurry"))
        assert result["issues"] == "shaky,blurry"

    def test_issues_all_invalid_defaults_to_none(self):
        result = parse_gemini_response(self._make_response(issues="invalid1,invalid2"))
        assert result["issues"] == "none"

    def test_segments_missing_defaults_to_empty(self):
        result = parse_gemini_response(self._make_response(segments=None))
        assert result["segments"] == []

    def test_segments_invalid_entries_skipped(self):
        result = parse_gemini_response(self._make_response(segments=["not a dict", 42]))
        assert result["segments"] == []

    def test_multiple_segments(self):
        segs = [
            {"start_sec": 0, "end_sec": 3, "label": "开头"},
            {"start_sec": 3, "end_sec": 7, "label": "高潮"},
        ]
        result = parse_gemini_response(self._make_response(segments=segs))
        assert len(result["segments"]) == 2
        assert result["segments"][1]["label"] == "高潮"


class TestEstimateCost:
    """Test token and cost estimation."""

    def test_estimate_cost_basic(self):
        result = estimate_cost(10.0)
        assert result["duration_seconds"] == 10.0
        assert result["estimated_input_tokens"] > 0
        assert result["estimated_output_tokens"] > 0
        assert result["estimated_cost_usd"] > 0

    def test_estimate_cost_zero_duration(self):
        result = estimate_cost(0.0)
        # Should still have prompt overhead tokens
        assert result["estimated_input_tokens"] == 250  # PROMPT_TOKENS
        assert result["estimated_cost_usd"] >= 0

    def test_estimate_cost_proportional_to_duration(self):
        short = estimate_cost(10.0)
        long = estimate_cost(60.0)
        assert long["estimated_input_tokens"] > short["estimated_input_tokens"]
        assert long["estimated_cost_usd"] > short["estimated_cost_usd"]

    def test_estimate_batch_cost(self):
        result = estimate_batch_cost([10.0, 20.0, 30.0])
        assert result["video_count"] == 3
        assert result["total_duration_seconds"] == 60.0
        assert result["total_estimated_input_tokens"] > 0
        assert result["total_estimated_cost_usd"] > 0

    def test_estimate_batch_cost_empty(self):
        result = estimate_batch_cost([])
        assert result["video_count"] == 0
        assert result["total_estimated_cost_usd"] == 0.0

    def test_estimate_batch_cost_matches_individual_sum(self):
        durations = [10.0, 20.0, 30.0]
        batch = estimate_batch_cost(durations)
        individual_sum = sum(estimate_cost(d)["estimated_cost_usd"] for d in durations)
        assert abs(batch["total_estimated_cost_usd"] - round(individual_sum, 6)) < 0.000001


class TestAnalyzeVideoWithMock:
    """Test video analysis with mocked Gemini client."""

    def _make_mock_client(self, response_text: str):
        """Create a mock genai client that returns the given response text."""
        client = MagicMock()

        # Mock file upload
        mock_file = MagicMock()
        mock_file.state.name = "ACTIVE"
        mock_file.name = "files/test-video-123"
        client.files.upload.return_value = mock_file
        client.files.get.return_value = mock_file

        # Mock generate_content
        mock_response = MagicMock()
        mock_response.text = response_text
        mock_usage = MagicMock()
        mock_usage.total_token_count = 5000
        mock_usage.prompt_token_count = 4200
        mock_usage.candidates_token_count = 650
        mock_usage.thoughts_token_count = 150
        mock_usage.prompt_tokens_details = [
            {"modality": "VIDEO", "token_count": 3600},
            {"modality": "AUDIO", "token_count": 200},
            {"modality": "TEXT", "token_count": 400},
        ]
        mock_response.usage_metadata = mock_usage
        client.models.generate_content.return_value = mock_response

        return client

    def test_analyze_video_success(self, tmp_path):
        response_json = json.dumps({
            "scene_category": "landscape",
            "quality_score": 8.5,
            "is_highlight": True,
            "mood": "epic",
            "description": "壮观的峡谷风景，阳光照耀下非常壮丽",
            "people_count": 0,
            "audio_type": "wind",
            "issues": "none",
            "segments": [{"start_sec": 0, "end_sec": 10, "label": "全景拍摄"}],
        })

        mock_client = self._make_mock_client(response_json)

        # Create a temporary fake video file
        video_file = tmp_path / "test.mp4"
        video_file.write_bytes(b"fake video content")

        result = analyze_video(str(video_file), client=mock_client, model="gemini-2.0-flash")

        assert result["scene_category"] == "landscape"
        assert result["quality_score"] == 8.5
        assert result["is_highlight"] is True
        assert result["mood"] == "epic"
        assert result["description"] == "壮观的峡谷风景，阳光照耀下非常壮丽"
        assert result["people_count"] == 0
        assert result["audio_type"] == "wind"
        assert result["issues"] == "none"
        assert len(result["segments"]) == 1
        assert result["raw_response"] == response_json
        assert result["cost_tokens"] == 5000
        assert result["prompt_token_count"] == 4200
        assert result["candidate_token_count"] == 650
        assert result["thoughts_token_count"] == 150
        assert result["prompt_tokens_details"][1]["modality"] == "AUDIO"
        assert result["model_version"] == "gemini-2.0-flash"

        # Verify client was called correctly
        mock_client.files.upload.assert_called_once()
        mock_client.models.generate_content.assert_called_once()
        call_args = mock_client.models.generate_content.call_args
        assert call_args.kwargs["model"] == "gemini-2.0-flash"

    def test_analyze_video_with_processing_wait(self, tmp_path):
        """Test that we correctly wait for PROCESSING state to finish."""
        client = MagicMock()

        # File starts in PROCESSING, then becomes ACTIVE
        processing_file = MagicMock()
        processing_file.state.name = "PROCESSING"
        processing_file.name = "files/test-123"

        active_file = MagicMock()
        active_file.state.name = "ACTIVE"
        active_file.name = "files/test-123"

        client.files.upload.return_value = processing_file
        client.files.get.side_effect = [processing_file, active_file]

        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "scene_category": "food",
            "quality_score": 7.0,
            "is_highlight": False,
            "mood": "warm",
            "description": "美食特写",
            "people_count": 0,
            "audio_type": "silence",
            "issues": "none",
            "segments": [],
        })
        mock_response.usage_metadata = None
        client.models.generate_content.return_value = mock_response

        video_file = tmp_path / "food.mp4"
        video_file.write_bytes(b"fake")

        with patch("clipmind.services.analysis.time.sleep"):
            result = analyze_video(str(video_file), client=client)

        assert result["scene_category"] == "food"
        assert result["cost_tokens"] is None  # No usage metadata


class TestUsageCost:
    def test_calculate_usage_cost_from_total_tokens_and_duration(self):
        cost = calculate_usage_cost(
            model="gemini-2.5-flash",
            total_token_count=1467910,
            duration_seconds=3051.348103,
        )
        assert cost == 1.451391

    def test_calculate_usage_cost_from_detailed_usage(self):
        cost = calculate_usage_cost(
            model="gemini-2.5-flash",
            prompt_token_count=4200,
            candidate_token_count=650,
            thoughts_token_count=150,
            prompt_tokens_details=[
                {"modality": "VIDEO", "token_count": 3600},
                {"modality": "AUDIO", "token_count": 200},
                {"modality": "TEXT", "token_count": 400},
            ],
        )
        assert cost == 0.0029

    def test_analyze_video_file_processing_failed(self, tmp_path):
        """Test that we raise an error if file processing fails."""
        client = MagicMock()

        failed_file = MagicMock()
        failed_file.state.name = "FAILED"
        failed_file.name = "files/test-fail"
        client.files.upload.return_value = failed_file

        video_file = tmp_path / "bad.mp4"
        video_file.write_bytes(b"fake")

        with pytest.raises(RuntimeError, match="file processing failed"):
            analyze_video(str(video_file), client=client)

    def test_analyze_video_invalid_json_response(self, tmp_path):
        """Test graceful handling when Gemini returns invalid JSON."""
        mock_client = self._make_mock_client("This is not JSON at all, sorry!")

        video_file = tmp_path / "test.mp4"
        video_file.write_bytes(b"fake")

        with pytest.raises(ValueError, match="Could not extract valid JSON"):
            analyze_video(str(video_file), client=mock_client)

    def test_analyze_video_markdown_wrapped_response(self, tmp_path):
        """Test that markdown-wrapped JSON is handled correctly."""
        response = '```json\n{"scene_category": "wildlife", "quality_score": 9, "is_highlight": true, "mood": "adventurous", "description": "海豚跳跃", "people_count": 0, "audio_type": "nature", "issues": "none", "segments": []}\n```'
        mock_client = self._make_mock_client(response)

        video_file = tmp_path / "dolphin.mp4"
        video_file.write_bytes(b"fake")

        result = analyze_video(str(video_file), client=mock_client)
        assert result["scene_category"] == "wildlife"
        assert result["mood"] == "adventurous"
