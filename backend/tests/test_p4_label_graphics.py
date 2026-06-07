import pytest

from apps.labels.barcodes import (
    build_code128_b_sequence,
    render_code128_symbol_svg,
    render_qr_symbol_svg,
)

LABEL_CODE = "CT-L-K7F3-9X2M-Q6V8-T4ND"
SCAN_URL = f"https://chronotrace.example.com/scan/{LABEL_CODE}"


def test_code128_b_sequence_uses_start_b_checksum_and_stop():
    data_values = [ord(char) - 32 for char in LABEL_CODE]
    expected_checksum = (104 + sum(index * value for index, value in enumerate(data_values, 1))) % 103

    assert build_code128_b_sequence(LABEL_CODE) == [104, *data_values, expected_checksum, 106]


@pytest.mark.parametrize("value", ["CT-L-K7F3\n9X2M", "资产-001"])
def test_code128_b_sequence_rejects_values_outside_code_set_b(value):
    with pytest.raises(ValueError, match="Code 128 B"):
        build_code128_b_sequence(value)


def test_code128_svg_contains_accessible_metadata_and_bars():
    svg = render_code128_symbol_svg(LABEL_CODE, x=12, y=18, width=220, height=42)

    assert 'data-kind="code128"' in svg
    assert f"<desc>{LABEL_CODE}</desc>" in svg
    assert 'transform="translate(12 18)"' in svg
    assert svg.count("<rect") > 20


def test_qr_svg_contains_accessible_metadata_and_modules():
    svg = render_qr_symbol_svg(SCAN_URL, x=16, y=20, size=96)

    assert 'data-kind="qr"' in svg
    assert f"<desc>{SCAN_URL}</desc>" in svg
    assert 'transform="translate(16 20)"' in svg
    assert svg.count("<rect") > 50
