"""游戏注册表：本仓库内置后端只服务一款游戏。

后端不认识游戏的内部实现，只认「题面 JSON」与「答案 JSON」两件事：

    题面 (payload)   服务端 → 客户端，只含线索，不含答案
    答案 (solution)  只留在服务端，任何时候都不出现在接口出参里
    交卷 (submitted) 客户端 → 服务端，按 canonical 形式提交
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field


class ValidationError(ValueError):
    """交卷内容格式不对（不是"答错"，是"根本没法验"）。"""


def _validate_shuzhi(payload: dict, solution: dict, submitted: dict) -> bool:
    """数织：解法唯一，逐格比对。

    题面有经典（行列线索）与马赛克（3x3 邻域计数）两种模式，但答案形式一致：
    h 行、每行 w 个 '#'（填色）或 '.'（留白）。
    """
    rows = submitted.get("rows")
    if not isinstance(rows, list):
        raise ValidationError("缺少 rows 字段")

    want = solution["rows"]
    h, w = len(want), len(want[0])
    if len(rows) != h:
        raise ValidationError(f"行数应为 {h}，收到 {len(rows)}")

    for y, row in enumerate(rows):
        if not isinstance(row, str) or len(row) != w:
            raise ValidationError(f"第 {y} 行长度应为 {w}")
        if set(row) - {"#", "."}:
            raise ValidationError(f"第 {y} 行含非法字符（只允许 # 和 .）")

    return rows == want


# --------------------------------------------------------------------------
# 注册表
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class GameSpec:
    id: str
    name: str
    kind: str  # 本仓库只服务判分类游戏
    variants: tuple[str, ...]
    difficulties: tuple[str, ...]
    validator: Callable[[dict, dict, dict], bool] | None = None
    daily_default: dict = field(default_factory=dict)
    accent: str = "#45d6c0"

    @property
    def rankable(self) -> bool:
        return self.kind == "puzzle"

    def check(self, payload: dict, solution: dict, submitted: dict) -> bool:
        """返回是否答对；交卷格式不合法则抛 ValidationError（→ 400）。"""
        return self.validator(payload, solution, submitted)


GAMES: dict[str, GameSpec] = {
    "shuzhi": GameSpec(
        id="shuzhi",
        name="数织·奇想",
        kind="puzzle",
        variants=("classic", "mosaik"),
        difficulties=("easy", "normal", "hard"),
        validator=_validate_shuzhi,
        daily_default={"variant": "classic", "difficulty": "normal"},
        accent="#e8b96a",
    ),
}


def get_game(game_id: str) -> GameSpec:
    try:
        return GAMES[game_id]
    except KeyError:
        raise KeyError(f"未知游戏: {game_id}") from None
