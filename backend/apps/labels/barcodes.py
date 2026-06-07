from __future__ import annotations

import html
from typing import Final

import segno

CODE128_START_B: Final = 104
CODE128_STOP: Final = 106
CODE128_QUIET_ZONE_MODULES: Final = 10
QR_QUIET_ZONE_MODULES: Final = 4

CODE128_PATTERNS: Final = (
    "212222",
    "222122",
    "222221",
    "121223",
    "121322",
    "131222",
    "122213",
    "122312",
    "132212",
    "221213",
    "221312",
    "231212",
    "112232",
    "122132",
    "122231",
    "113222",
    "123122",
    "123221",
    "223211",
    "221132",
    "221231",
    "213212",
    "223112",
    "312131",
    "311222",
    "321122",
    "321221",
    "312212",
    "322112",
    "322211",
    "212123",
    "212321",
    "232121",
    "111323",
    "131123",
    "131321",
    "112313",
    "132113",
    "132311",
    "211313",
    "231113",
    "231311",
    "112133",
    "112331",
    "132131",
    "113123",
    "113321",
    "133121",
    "313121",
    "211331",
    "231131",
    "213113",
    "213311",
    "213131",
    "311123",
    "311321",
    "331121",
    "312113",
    "312311",
    "332111",
    "314111",
    "221411",
    "431111",
    "111224",
    "111422",
    "121124",
    "121421",
    "141122",
    "141221",
    "112214",
    "112412",
    "122114",
    "122411",
    "142112",
    "142211",
    "241211",
    "221114",
    "413111",
    "241112",
    "134111",
    "111242",
    "121142",
    "121241",
    "114212",
    "124112",
    "124211",
    "411212",
    "421112",
    "421211",
    "212141",
    "214121",
    "412121",
    "111143",
    "111341",
    "131141",
    "114113",
    "114311",
    "411113",
    "411311",
    "113141",
    "114131",
    "311141",
    "411131",
    "211412",
    "211214",
    "211232",
    "2331112",
)


def build_code128_b_sequence(value: str) -> list[int]:
    data_values = [_code128_b_value(char) for char in value]
    checksum = (
        CODE128_START_B
        + sum(index * code_value for index, code_value in enumerate(data_values, 1))
    ) % 103
    return [CODE128_START_B, *data_values, checksum, CODE128_STOP]


def render_qr_symbol_svg(value: str, x: float, y: float, size: float) -> str:
    matrix = tuple(tuple(row) for row in segno.make_qr(value, error="m").matrix_iter(border=QR_QUIET_ZONE_MODULES))
    module_size = size / len(matrix)
    rects = "\n    ".join(_qr_module_rects(matrix, module_size))
    return f"""<g data-kind="qr" transform="translate({_fmt(x)} {_fmt(y)})" shape-rendering="crispEdges">
    <title>QR</title>
    <desc>{_esc(value)}</desc>
    <rect x="0" y="0" width="{_fmt(size)}" height="{_fmt(size)}" fill="#ffffff"/>
    {rects}
  </g>"""


def render_code128_symbol_svg(value: str, x: float, y: float, width: float, height: float) -> str:
    patterns = [CODE128_PATTERNS[code] for code in build_code128_b_sequence(value)]
    module_count = sum(sum(int(part) for part in pattern) for pattern in patterns)
    module_width = width / (module_count + CODE128_QUIET_ZONE_MODULES * 2)
    rects = "\n    ".join(_code128_bar_rects(patterns, module_width, height))
    return f"""<g data-kind="code128" transform="translate({_fmt(x)} {_fmt(y)})" shape-rendering="crispEdges">
    <title>Code 128</title>
    <desc>{_esc(value)}</desc>
    <rect x="0" y="0" width="{_fmt(width)}" height="{_fmt(height)}" fill="#ffffff"/>
    {rects}
  </g>"""


def _qr_module_rects(matrix: tuple[tuple[int, ...], ...], module_size: float) -> list[str]:
    rects = []
    for row_index, row in enumerate(matrix):
        column = 0
        while column < len(row):
            if not row[column]:
                column += 1
                continue
            run_length = _dark_run_length(row, column)
            rect_x = _fmt(column * module_size)
            rect_y = _fmt(row_index * module_size)
            rect_width = _fmt(run_length * module_size)
            rect_height = _fmt(module_size)
            rects.append(
                f'<rect x="{rect_x}" y="{rect_y}" width="{rect_width}" '
                f'height="{rect_height}" fill="#111111"/>'
            )
            column += run_length
    return rects


def _code128_bar_rects(patterns: list[str], module_width: float, height: float) -> list[str]:
    rects = []
    cursor = CODE128_QUIET_ZONE_MODULES
    for pattern in patterns:
        for index, run in enumerate(pattern):
            run_width = int(run)
            if index % 2 == 0:
                rect_x = _fmt(cursor * module_width)
                rect_width = _fmt(run_width * module_width)
                rect_height = _fmt(height)
                rects.append(
                    f'<rect x="{rect_x}" y="0" width="{rect_width}" '
                    f'height="{rect_height}" fill="#111111"/>'
                )
            cursor += run_width
    return rects


def _dark_run_length(row: tuple[int, ...], start: int) -> int:
    end = start
    while end < len(row) and row[end]:
        end += 1
    return end - start


def _code128_b_value(char: str) -> int:
    codepoint = ord(char)
    if codepoint < 32 or codepoint > 127:
        raise ValueError("Code 128 B only supports ASCII 32-127")
    return codepoint - 32


def _fmt(value: float) -> str:
    number = float(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:.4f}".rstrip("0").rstrip(".")


def _esc(value: object) -> str:
    return html.escape(str(value), quote=True)
