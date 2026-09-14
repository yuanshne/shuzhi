"""题面自洽性校验。

这一层的价值全在"能抓出真问题"上，所以测试里故意构造各种题面与答案对不上的情况。
"""
from __future__ import annotations

import pytest

from app.consistency import InconsistentPuzzle, check_consistency
from tests.conftest import GAME

# ------------------------------------------------------------------ 本游戏

# ------------------------------------------------------------------ 数织

CLASSIC = {
    "mode": "classic",
    "w": 3,
    "h": 3,
    "rowClues": [[1], [3], [1]],
    "colClues": [[1], [3], [1]],
}


def test_valid_classic_passes():
    check_consistency(GAME, CLASSIC, {"rows": [".#.", "###", ".#."]})


def test_classic_wrong_row_clue_is_caught():
    with pytest.raises(InconsistentPuzzle) as exc:
        check_consistency(GAME, CLASSIC, {"rows": ["###", "###", "###"]})
    assert "行线索" in str(exc.value)


def test_classic_wrong_col_clue_is_caught():
    payload = dict(CLASSIC, colClues=[[3], [3], [3]])
    with pytest.raises(InconsistentPuzzle) as exc:
        check_consistency(GAME, payload, {"rows": [".#.", "###", ".#."]})
    assert "列线索" in str(exc.value)


def test_classic_size_mismatch_is_caught():
    payload = dict(CLASSIC, w=5, h=5)
    with pytest.raises(InconsistentPuzzle) as exc:
        check_consistency(GAME, payload, {"rows": [".#.", "###", ".#."]})
    assert "标称" in str(exc.value)


def test_classic_rejects_illegal_chars():
    with pytest.raises(InconsistentPuzzle):
        check_consistency(GAME, CLASSIC, {"rows": ["..#", "#X#", "..#"]})


def test_classic_rejects_ragged_rows():
    with pytest.raises(InconsistentPuzzle) as exc:
        check_consistency(GAME, CLASSIC, {"rows": [".#.", "###", ".#"]})
    assert "长度不一致" in str(exc.value)


def test_unknown_shuzhi_mode_is_caught():
    with pytest.raises(InconsistentPuzzle) as exc:
        check_consistency(GAME, {"mode": "?", "w": 1, "h": 1}, {"rows": ["."]})
    assert "未知" in str(exc.value)


# 马赛克：线索 = 3×3 邻域内填充数
MOSAIK_SOLUTION = ["##.", "#..", "..."]
MOSAIK_CLUES = [
    [3, 3, 1],
    [3, 3, 1],
    [1, 1, 0],
]


def test_valid_mosaik_passes():
    payload = {"mode": "mosaik", "w": 3, "h": 3, "clues": MOSAIK_CLUES}
    check_consistency(GAME, payload, {"rows": MOSAIK_SOLUTION})


def test_mosaik_wrong_count_is_caught():
    clues = [row[:] for row in MOSAIK_CLUES]
    clues[0][0] = 9
    payload = {"mode": "mosaik", "w": 3, "h": 3, "clues": clues}
    with pytest.raises(InconsistentPuzzle) as exc:
        check_consistency(GAME, payload, {"rows": MOSAIK_SOLUTION})
    assert "(0,0)" in str(exc.value)



# ------------------------------------------------------------------ 未注册的游戏

# ------------------------------------------------------------------ 未注册的游戏

def test_unregistered_game_is_skipped():
    """注册表里没有的游戏不做检查，交给上层决定怎么处理。"""
    check_consistency("nonexistent", {"x": 1}, {"y": 2})
