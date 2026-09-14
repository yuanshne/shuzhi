"""校验器单元测试：不经过 HTTP，直接打 app/games.py。

重点是"格式错误"与"答错"必须区分开 —— 前者 400、后者 200。
"""
from __future__ import annotations

import pytest

from app.games import GAMES, ValidationError, get_game
from tests.conftest import GAME

# ------------------------------------------------------------------ 数织

SHUZHI_PAYLOAD = {
    "mode": "classic",
    "w": 3,
    "h": 3,
    "rowClues": [[1], [3], [1]],
    "colClues": [[1], [3], [1]],
}
SHUZHI_SOLUTION = {"rows": [".#.", "###", ".#."]}


def test_shuzhi_accepts_exact_solution():
    assert get_game(GAME).check(SHUZHI_PAYLOAD, SHUZHI_SOLUTION, {"rows": SHUZHI_SOLUTION["rows"]})


def test_shuzhi_rejects_wrong_solution():
    wrong = {"rows": ["###", "###", "###"]}
    assert get_game(GAME).check(SHUZHI_PAYLOAD, SHUZHI_SOLUTION, wrong) is False


@pytest.mark.parametrize(
    "bad, needle",
    [
        ({}, "rows"),
        ({"rows": "..#"}, "rows"),
        ({"rows": ["..#", "..#"]}, "行数"),
        ({"rows": ["..", "..#", "..#"]}, "长度"),
        ({"rows": ["..#", "..#", "..X"]}, "非法字符"),
    ],
)
def test_shuzhi_malformed_submissions_raise(bad, needle):
    with pytest.raises(ValidationError) as exc:
        get_game(GAME).check(SHUZHI_PAYLOAD, SHUZHI_SOLUTION, bad)
    assert needle in str(exc.value)


# ------------------------------------------------------------------ 注册表

# ------------------------------------------------------------------ 注册表

def test_registry_is_self_consistent():
    assert set(GAMES) == {"shuzhi"}
    for spec in GAMES.values():
        assert spec.id in GAMES
        assert spec.daily_default["variant"] in spec.variants
        assert spec.daily_default["difficulty"] in spec.difficulties
        assert spec.accent.startswith("#")


def test_unknown_game_raises():
    with pytest.raises(KeyError):
        get_game("nope")
