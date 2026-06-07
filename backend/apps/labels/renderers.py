from __future__ import annotations

import html
import math
import unicodedata
from collections.abc import Sequence
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.schemas.field_security import serialize_data_payload
from apps.schemas.identity import field_is_system_hidden, resolve_display_code_or_fallback
from apps.temporal.models import TemporalRecord

from .barcodes import render_code128_symbol_svg, render_qr_symbol_svg
from .models import EntityLabel
from .template_config import label_print_config_hash, resolve_label_print_config

SHEET_WIDTH = 794
SHEET_PAGE_HEIGHT = 1123
SHEET_COLUMNS = 2
SHEET_ROWS = 5
SHEET_LABELS_PER_PAGE = SHEET_COLUMNS * SHEET_ROWS
SHEET_CELL_WIDTH = 360
SHEET_CELL_HEIGHT = 200
SHEET_MARGIN_X = 28
SHEET_MARGIN_Y = 34
SHEET_GAP_X = 18
SHEET_GAP_Y = 16
LABEL_TEMPLATE_CODES = {"asset_standard", "small", "document_cover"}


def render_label_svg(
    label: EntityLabel,
    template_code: str,
    base_scan_url: str,
    actor,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_config = resolve_label_print_config(label.schema, config)
    template = _resolve_render_template(label, template_code, resolved_config)
    snapshot = build_print_snapshot(
        label,
        template_code,
        base_scan_url,
        actor,
        template,
        resolved_config.to_dict(),
    )
    content = _single_label_svg(label, snapshot)
    return {"content": content.encode("utf-8"), "snapshot": snapshot}


def _single_label_svg(label: EntityLabel, snapshot: dict[str, Any]) -> str:
    template_code = snapshot["label_template_code"]
    if template_code == "small":
        return _small_label_svg(label, snapshot)
    if template_code == "document_cover":
        return _document_cover_label_svg(label, snapshot)
    return _asset_standard_label_svg(label, snapshot)


def _asset_standard_label_svg(label: EntityLabel, snapshot: dict[str, Any]) -> str:
    qr_visible = _visible(snapshot, "show_qr")
    fields = "\n".join(
        _asset_standard_field_text(index, field, qr_visible=qr_visible)
        for index, field in enumerate(snapshot["fields"][:3])
    )
    qr_symbol = _qr_symbol(snapshot, 244, 24, 88)
    barcode_symbol = _barcode_symbol(label, snapshot, 24, 158, 312, 34)
    brand = _text_if(snapshot, "show_brand", '<text x="24" y="30" font-family="Arial, sans-serif" font-size="10" font-weight="700">固定资产标签</text>')
    text_width = 208 if qr_visible else 312
    display_code = _text_if(
        snapshot,
        "show_display_code",
        _bounded_text(
            snapshot["display_code"],
            x=24,
            y=54,
            max_width=text_width,
            font_family="Arial, sans-serif",
            font_size=18,
            font_weight="700",
            kind="display-code",
        ),
    )
    label_code = _text_if(
        snapshot,
        "show_label_code",
        _bounded_text(
            label.label_code,
            x=24,
            y=78,
            max_width=text_width,
            font_family="Consolas, monospace",
            font_size=13,
            kind="label-code",
        ),
    )
    hint = _text_if(snapshot, "show_hint", '<text x="24" y="146" font-family="Arial, sans-serif" font-size="10">扫码查看生命周期</text>')
    scan_url = _scan_url_text(snapshot, 24, 202, 8, 312)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220" role="img" data-template="asset_standard">
  <rect width="360" height="220" fill="#ffffff"/>
  <rect x="12" y="12" width="336" height="196" fill="none" stroke="#111111" stroke-width="2"/>
  {qr_symbol}
  {brand}
  {display_code}
  {label_code}
  {fields}
  {hint}
  {barcode_symbol}
  {scan_url}
</svg>"""


def _small_label_svg(label: EntityLabel, snapshot: dict[str, Any]) -> str:
    qr_symbol = _qr_symbol(snapshot, 12, 12, 52)
    barcode_symbol = _barcode_symbol(label, snapshot, 76, 82, 172, 22)
    brand = _text_if(snapshot, "show_brand", '<text x="76" y="24" font-family="Arial, sans-serif" font-size="10" font-weight="700">小标签</text>')
    display_code = _text_if(
        snapshot,
        "show_display_code",
        _bounded_text(
            snapshot["display_code"],
            x=76,
            y=48,
            max_width=172,
            font_family="Arial, sans-serif",
            font_size=17,
            font_weight="700",
            kind="display-code",
        ),
    )
    label_code = _text_if(
        snapshot,
        "show_label_code",
        _bounded_text(
            label.label_code,
            x=76,
            y=68,
            max_width=172,
            font_family="Consolas, monospace",
            font_size=10,
            kind="label-code",
        ),
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120" viewBox="0 0 260 120" role="img" data-template="small">
  <rect width="260" height="120" fill="#ffffff"/>
  <rect x="6" y="6" width="248" height="108" fill="none" stroke="#111111" stroke-width="1.5"/>
  {qr_symbol}
  {brand}
  {display_code}
  {label_code}
  {barcode_symbol}
</svg>"""


def _document_cover_label_svg(label: EntityLabel, snapshot: dict[str, Any]) -> str:
    fields = "\n".join(
        _positioned_field_text(
            index,
            field,
            x=28,
            start_y=146,
            line_height=20,
            font_size=13,
            max_width=452,
        )
        for index, field in enumerate(snapshot["fields"][:4])
    )
    qr_symbol = _qr_symbol(snapshot, 392, 32, 96)
    barcode_symbol = _barcode_symbol(label, snapshot, 28, 218, 360, 34)
    brand = _text_if(snapshot, "show_brand", '<text x="28" y="40" font-family="Arial, sans-serif" font-size="18" font-weight="700">档案封面标签</text>')
    display_code = _text_if(
        snapshot,
        "show_display_code",
        _bounded_text(
            snapshot["display_code"],
            x=28,
            y=88,
            max_width=352,
            font_family="Arial, sans-serif",
            font_size=26,
            font_weight="700",
            kind="display-code",
        ),
    )
    label_code = _text_if(
        snapshot,
        "show_label_code",
        _bounded_text(
            label.label_code,
            x=28,
            y=118,
            max_width=352,
            font_family="Consolas, monospace",
            font_size=13,
            kind="label-code",
        ),
    )
    scan_url = _scan_url_text(snapshot, 28, 264, 8, 452)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="520" height="280" viewBox="0 0 520 280" role="img" data-template="document_cover">
  <rect width="520" height="280" fill="#ffffff"/>
  <rect x="12" y="12" width="496" height="256" fill="none" stroke="#111111" stroke-width="2"/>
  <rect x="12" y="12" width="496" height="42" fill="#f4f4f5" stroke="#111111" stroke-width="2"/>
  {brand}
  {qr_symbol}
  {display_code}
  {label_code}
  {fields}
  {barcode_symbol}
  {scan_url}
</svg>"""


def render_label_sheet_svg(
    label_items: Sequence[tuple[EntityLabel, str]],
    template_code: str,
    actor,
) -> dict[str, Any]:
    snapshots = []
    cells = []
    for index, (label, scan_url) in enumerate(label_items):
        resolved_config = resolve_label_print_config(label.schema)
        template = _resolve_render_template(label, template_code, resolved_config)
        snapshot = build_print_snapshot(
            label,
            template_code,
            scan_url,
            actor,
            template,
            resolved_config.to_dict(),
        )
        snapshots.append({"label": label, "snapshot": snapshot})
        cells.append(_sheet_cell(index, label, snapshot))

    page_count = max(1, math.ceil(len(label_items) / SHEET_LABELS_PER_PAGE))
    pages = "\n".join(_sheet_page(page_index) for page_index in range(page_count))
    content = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SHEET_WIDTH}" height="{SHEET_PAGE_HEIGHT * page_count}" viewBox="0 0 {SHEET_WIDTH} {SHEET_PAGE_HEIGHT * page_count}" role="img">
  <rect width="{SHEET_WIDTH}" height="{SHEET_PAGE_HEIGHT * page_count}" fill="#f3f4f6"/>
  {pages}
  {"".join(cells)}
</svg>"""
    return {"content": content.encode("utf-8"), "snapshots": snapshots}


def build_print_snapshot(
    label: EntityLabel,
    template_code: str,
    base_scan_url: str,
    actor,
    template,
    resolved_config: dict[str, Any],
) -> dict[str, Any]:
    record = _current_record(label)
    payload = serialize_data_payload(
        label.schema,
        label.schema.fields_config,
        record.data_payload if record else {},
        actor,
    )
    display_code = resolve_display_code_or_fallback(label.schema, payload, label.entity.business_code)
    return {
        "template_code": template_code,
        "label_template_code": template.code,
        "label_code": label.label_code,
        "scan_url": base_scan_url,
        "display_code": display_code,
        "fields": _print_fields(label, payload, template),
        "resolved_config": template.to_dict(),
        "label_print_config_hash": label_print_config_hash(resolved_config),
        "rendered_at": timezone.now().isoformat(),
    }


def _current_record(label: EntityLabel) -> TemporalRecord | None:
    today = timezone.localdate()
    return (
        TemporalRecord.objects.filter(entity=label.entity, is_superseded=False)
        .filter(valid_from__lte=today)
        .filter(Q(valid_to__isnull=True) | Q(valid_to__gt=today))
        .order_by("-valid_from", "-id")
        .first()
    )


def _print_fields(label: EntityLabel, payload: dict[str, Any], template) -> list[dict[str, Any]]:
    if template.field_keys_configured:
        return [
            _field_payload(label, payload, field_key)
            for field_key in template.field_keys
            if _field_payload(label, payload, field_key) is not None
        ]

    fields = []
    for field in label.schema.fields_config:
        key = field.get("key")
        if not _printable_field(field, key, label.schema.identity_field_key):
            continue
        if key in payload and not isinstance(payload[key], dict | list):
            fields.append({"key": key, "label": field.get("label") or key, "value": payload[key]})
    return fields[:4]


def _field_payload(label: EntityLabel, payload: dict[str, Any], field_key: str) -> dict[str, Any] | None:
    field = next(
        (
            item
            for item in label.schema.fields_config
            if isinstance(item, dict) and item.get("key") == field_key
        ),
        None,
    )
    if field is None or field_key not in payload or isinstance(payload[field_key], dict | list):
        return None
    return {"key": field_key, "label": field.get("label") or field_key, "value": payload[field_key]}


def _printable_field(field: dict[str, Any], key: object, identity_key: str) -> bool:
    return (
        isinstance(key, str)
        and key != identity_key
        and not field.get("sensitive", False)
        and not field_is_system_hidden(field)
    )


def _asset_standard_field_text(
    index: int,
    field: dict[str, Any],
    *,
    qr_visible: bool,
) -> str:
    max_width = 208 if qr_visible and index < 2 else 312
    return _positioned_field_text(
        index,
        field,
        x=24,
        start_y=98,
        line_height=16,
        font_size=11,
        max_width=max_width,
    )


def _positioned_field_text(
    index: int,
    field: dict[str, Any],
    x: int,
    start_y: int,
    line_height: int,
    font_size: int,
    max_width: int,
) -> str:
    y = start_y + index * line_height
    return _bounded_text(
        f'{field["label"]}: {field["value"]}',
        x=x,
        y=y,
        max_width=max_width,
        font_family="Arial, sans-serif",
        font_size=font_size,
        kind="field",
    )


def _sheet_page(page_index: int) -> str:
    y = page_index * SHEET_PAGE_HEIGHT
    return (
        f'<g transform="translate(0 {y})">'
        f'<rect x="0" y="0" width="{SHEET_WIDTH}" height="{SHEET_PAGE_HEIGHT}" fill="#ffffff"/>'
        f'<text x="{SHEET_MARGIN_X}" y="{SHEET_PAGE_HEIGHT - 18}" '
        'font-family="Consolas, monospace" font-size="10">ChronoTrace A4 Label Sheet</text>'
        "</g>"
    )


def _sheet_cell(index: int, label: EntityLabel, snapshot: dict[str, Any]) -> str:
    page_index = index // SHEET_LABELS_PER_PAGE
    page_slot = index % SHEET_LABELS_PER_PAGE
    row = page_slot // SHEET_COLUMNS
    column = page_slot % SHEET_COLUMNS
    x = SHEET_MARGIN_X + column * (SHEET_CELL_WIDTH + SHEET_GAP_X)
    y = page_index * SHEET_PAGE_HEIGHT + SHEET_MARGIN_Y + row * (SHEET_CELL_HEIGHT + SHEET_GAP_Y)
    if snapshot["label_template_code"] == "small":
        return _small_sheet_cell(x, y, label, snapshot)
    if snapshot["label_template_code"] == "document_cover":
        return _document_cover_sheet_cell(x, y, label, snapshot)
    return _asset_standard_sheet_cell(x, y, label, snapshot)


def _asset_standard_sheet_cell(x: int, y: int, label: EntityLabel, snapshot: dict[str, Any]) -> str:
    fields = "\n".join(
        _sheet_field_text(field_index, field, max_width=236)
        for field_index, field in enumerate(snapshot["fields"][:2])
    )
    qr_symbol = _qr_symbol(snapshot, 16, 16, 76)
    barcode_symbol = _barcode_symbol(label, snapshot, 16, 135, 316, 34)
    brand = _text_if(snapshot, "show_brand", '<text x="108" y="18" font-family="Arial, sans-serif" font-size="9" font-weight="700">固定资产标签</text>')
    display_code = _text_if(
        snapshot,
        "show_display_code",
        _bounded_text(
            snapshot["display_code"],
            x=108,
            y=34,
            max_width=236,
            font_family="Arial, sans-serif",
            font_size=16,
            font_weight="700",
            kind="display-code",
        ),
    )
    label_code = _text_if(
        snapshot,
        "show_label_code",
        _bounded_text(
            label.label_code,
            x=108,
            y=60,
            max_width=236,
            font_family="Consolas, monospace",
            font_size=11,
            kind="label-code",
        ),
    )
    hint = _text_if(snapshot, "show_hint", '<text x="16" y="126" font-family="Arial, sans-serif" font-size="10">扫码查看生命周期</text>')
    scan_url = _scan_url_text(snapshot, 16, 188, 7, 316)
    return f"""<g transform="translate({x} {y})" data-template="asset_standard">
  <rect width="{SHEET_CELL_WIDTH}" height="{SHEET_CELL_HEIGHT}" rx="0" fill="#ffffff" stroke="#111111" stroke-width="1.5"/>
  {qr_symbol}
  {brand}
  {display_code}
  {label_code}
  {fields}
  {hint}
  {barcode_symbol}
  {scan_url}
</g>"""


def _small_sheet_cell(x: int, y: int, label: EntityLabel, snapshot: dict[str, Any]) -> str:
    qr_symbol = _qr_symbol(snapshot, 34, 55, 52)
    barcode_symbol = _barcode_symbol(label, snapshot, 104, 128, 220, 26)
    brand = _text_if(snapshot, "show_brand", '<text x="104" y="62" font-family="Arial, sans-serif" font-size="10" font-weight="700">小标签</text>')
    display_code = _text_if(
        snapshot,
        "show_display_code",
        _bounded_text(
            snapshot["display_code"],
            x=104,
            y=86,
            max_width=220,
            font_family="Arial, sans-serif",
            font_size=18,
            font_weight="700",
            kind="display-code",
        ),
    )
    label_code = _text_if(
        snapshot,
        "show_label_code",
        _bounded_text(
            label.label_code,
            x=104,
            y=108,
            max_width=220,
            font_family="Consolas, monospace",
            font_size=10,
            kind="label-code",
        ),
    )
    return f"""<g transform="translate({x} {y})" data-template="small">
  <rect width="{SHEET_CELL_WIDTH}" height="{SHEET_CELL_HEIGHT}" rx="0" fill="#ffffff" stroke="#111111" stroke-width="1.5"/>
  <rect x="20" y="40" width="320" height="118" fill="none" stroke="#111111" stroke-width="1"/>
  {qr_symbol}
  {brand}
  {display_code}
  {label_code}
  {barcode_symbol}
</g>"""


def _document_cover_sheet_cell(x: int, y: int, label: EntityLabel, snapshot: dict[str, Any]) -> str:
    fields = "\n".join(
        _sheet_field_text(
            field_index,
            field,
            max_width=140 if field_index == 0 else 230,
        )
        for field_index, field in enumerate(snapshot["fields"][:3])
    )
    qr_symbol = _qr_symbol(snapshot, 260, 20, 76)
    barcode_symbol = _barcode_symbol(label, snapshot, 22, 142, 300, 30)
    brand = _text_if(snapshot, "show_brand", '<text x="16" y="19" font-family="Arial, sans-serif" font-size="11" font-weight="700">档案封面标签</text>')
    display_code = _text_if(
        snapshot,
        "show_display_code",
        _bounded_text(
            snapshot["display_code"],
            x=22,
            y=54,
            max_width=226,
            font_family="Arial, sans-serif",
            font_size=19,
            font_weight="700",
            kind="display-code",
        ),
    )
    label_code = _text_if(
        snapshot,
        "show_label_code",
        _bounded_text(
            label.label_code,
            x=22,
            y=78,
            max_width=226,
            font_family="Consolas, monospace",
            font_size=10,
            kind="label-code",
        ),
    )
    scan_url = _scan_url_text(snapshot, 22, 188, 7, 316)
    return f"""<g transform="translate({x} {y})" data-template="document_cover">
  <rect width="{SHEET_CELL_WIDTH}" height="{SHEET_CELL_HEIGHT}" rx="0" fill="#ffffff" stroke="#111111" stroke-width="1.5"/>
  <rect x="0" y="0" width="{SHEET_CELL_WIDTH}" height="28" fill="#f4f4f5" stroke="#111111" stroke-width="1"/>
  {brand}
  {qr_symbol}
  {display_code}
  {label_code}
  {fields}
  {barcode_symbol}
  {scan_url}
</g>"""


def _sheet_field_text(index: int, field: dict[str, Any], *, max_width: int) -> str:
    y = 92 + index * 18
    return _bounded_text(
        f'{field["label"]}: {field["value"]}',
        x=108,
        y=y,
        max_width=max_width,
        font_family="Arial, sans-serif",
        font_size=11,
        kind="field",
    )


def _qr_symbol(snapshot: dict[str, Any], x: int, y: int, size: int) -> str:
    if not _visible(snapshot, "show_qr"):
        return ""
    return render_qr_symbol_svg(snapshot["scan_url"], x, y, size)


def _barcode_symbol(
    label: EntityLabel,
    snapshot: dict[str, Any],
    x: int,
    y: int,
    width: int,
    height: int,
) -> str:
    if not _visible(snapshot, "show_barcode"):
        return ""
    return render_code128_symbol_svg(label.label_code, x, y, width, height)


def _scan_url_text(
    snapshot: dict[str, Any],
    x: int,
    y: int,
    font_size: int,
    max_width: int,
) -> str:
    return _text_if(
        snapshot,
        "show_scan_url",
        _bounded_text(
            snapshot["scan_url"],
            x=x,
            y=y,
            max_width=max_width,
            font_family="Consolas, monospace",
            font_size=font_size,
            kind="scan-url",
        ),
    )


def _text_if(snapshot: dict[str, Any], flag: str, content: str) -> str:
    return content if _visible(snapshot, flag) else ""


def _visible(snapshot: dict[str, Any], flag: str) -> bool:
    return bool(snapshot.get("resolved_config", {}).get(flag, True))


def _bounded_text(
    value: object,
    *,
    x: int,
    y: int,
    max_width: int,
    font_family: str,
    font_size: int,
    kind: str,
    font_weight: str | None = None,
) -> str:
    full_text = str(value)
    fitted_text = _fit_text(full_text, max_width, font_size)
    weight = f' font-weight="{font_weight}"' if font_weight else ""
    title = f"<title>{_esc(full_text)}</title>" if fitted_text != full_text else ""
    return (
        f'<svg x="{x}" y="{y - font_size}" width="{max_width}" '
        f'height="{font_size + 4}" overflow="hidden" data-text-kind="{kind}">'
        f"{title}"
        f'<text x="0" y="{font_size}" font-family="{font_family}" '
        f'font-size="{font_size}"{weight}>{_esc(fitted_text)}</text></svg>'
    )


def _fit_text(text: str, max_width: int, font_size: int) -> str:
    if _estimated_text_width(text, font_size) <= max_width:
        return text
    suffix = "..."
    suffix_width = _estimated_text_width(suffix, font_size)
    width = 0.0
    chars = []
    for char in text:
        char_width = _estimated_char_width(char, font_size)
        if width + char_width + suffix_width > max_width:
            break
        chars.append(char)
        width += char_width
    return f'{"".join(chars).rstrip()}{suffix}' if chars else suffix


def _estimated_text_width(text: str, font_size: int) -> float:
    return sum(_estimated_char_width(char, font_size) for char in text)


def _estimated_char_width(char: str, font_size: int) -> float:
    if unicodedata.east_asian_width(char) in {"F", "W"}:
        return font_size
    if char in " .,:;|!":
        return font_size * 0.3
    if char in "-_/\\@":
        return font_size * 0.5
    if char.isupper():
        return font_size * 0.68
    if char.isdigit():
        return font_size * 0.55
    return font_size * 0.58


def _label_template_code(label: EntityLabel, template_code: str) -> str:
    candidate = label.template_code if template_code == "a4_grid" else template_code
    return candidate if candidate in LABEL_TEMPLATE_CODES else "asset_standard"


def _resolve_render_template(label: EntityLabel, template_code: str, resolved_config):
    candidate = label.template_code if template_code == "a4_grid" else template_code
    if candidate in resolved_config.templates:
        return resolved_config.templates[candidate]
    if "asset_standard" in resolved_config.templates:
        return resolved_config.templates["asset_standard"]
    return resolved_config.templates[resolved_config.default_template_code]


def _esc(value: object) -> str:
    return html.escape(str(value), quote=True)
