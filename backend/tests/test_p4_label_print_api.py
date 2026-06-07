import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.changesets.models import ChangeSet
from apps.labels.models import EntityLabel
from apps.schemas.models import DataSchema, SchemaVersion, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "editor": User.objects.create_user(username="editor", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


def create_label_for_entity(
    schema,
    user,
    code: str,
    business_code: str,
    location: str,
    template_code: str = "asset_standard",
) -> EntityLabel:
    entity = Entity.objects.create(schema=schema, business_code=business_code, created_by=user)
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary=f"初始化 {business_code}",
        status=ChangeSet.Status.APPLIED,
        created_by=user,
        applied_at=timezone.now(),
    )
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={
            "asset_no": business_code,
            "location": location,
            "serial_no": f"SECRET-{business_code}",
        },
        valid_from=dt.date(2026, 1, 1),
        change_set=change_set,
        recorded_by=user,
    )
    return EntityLabel.objects.create(
        label_code=code,
        entity=entity,
        schema=schema,
        template_code=template_code,
        issued_by=user,
    )


@pytest.fixture
def label(users):
    schema = DataSchema.objects.create(
        schema_code="asset_print_api",
        name="打印资产表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "required": True},
            {"key": "location", "label": "位置", "type": "text"},
            {"key": "serial_no", "label": "序列号", "type": "text", "sensitive": True},
        ],
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="初始版本",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["editor"],
        role=TableCollaborator.Role.EDITOR,
        added_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role=TableCollaborator.Role.VIEWER,
        added_by=users["owner"],
    )
    entity = Entity.objects.create(schema=schema, business_code="ASSET-001", created_by=users["owner"])
    change_set = ChangeSet.objects.create(
        schema=schema,
        summary="初始化资产",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={
            "asset_no": "打印资产-001",
            "location": "二号库",
            "serial_no": "SECRET-PRINT-001",
        },
        valid_from=dt.date(2026, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    return EntityLabel.objects.create(
        label_code="CT-L-K7F3-9X2M-Q6V8-T4ND",
        entity=entity,
        schema=schema,
        issued_by=users["owner"],
    )


@pytest.mark.django_db
def test_editor_can_print_svg_and_print_action_is_audited(client, users, label):
    response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg", "template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("image/svg+xml")
    assert b"<svg" in response.content
    assert label.label_code.encode() in response.content
    svg = response.content.decode("utf-8")
    assert 'data-kind="qr"' in svg
    assert 'data-kind="code128"' in svg
    assert "SCAN</text>" not in svg

    label.refresh_from_db()
    assert label.printed_by == users["editor"]
    assert label.printed_at is not None
    assert label.print_snapshot["display_code"] == "打印资产-001"
    assert label.print_snapshot["fields"] == [{"key": "location", "label": "位置", "value": "二号库"}]
    assert "serial_no" not in str(label.print_snapshot)
    assert AuditLog.objects.filter(action="label.print", target_id=label.id).exists()


@pytest.mark.parametrize(
    ("template_code", "size", "marker"),
    [
        ("asset_standard", 'width="360" height="220"', "固定资产标签"),
        ("small", 'width="260" height="120"', "小标签"),
        ("document_cover", 'width="520" height="280"', "档案封面标签"),
    ],
)
@pytest.mark.django_db
def test_label_print_templates_render_distinct_svg_layouts(
    client, users, label, template_code, size, marker
):
    response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg", "template_code": template_code},
        format="json",
    )

    assert response.status_code == 200
    svg = response.content.decode("utf-8")
    assert f'data-template="{template_code}"' in svg
    assert size in svg
    assert marker in svg
    assert 'data-kind="qr"' in svg
    assert 'data-kind="code128"' in svg


@pytest.mark.django_db
def test_asset_standard_print_bounds_long_field_text(client, users, label):
    label.schema.fields_config = [
        {"key": "asset_no", "label": "资产编号", "type": "text", "required": True},
        {"key": "department", "label": "部门", "type": "text"},
        {"key": "model", "label": "型号", "type": "text"},
        {"key": "spec", "label": "硬盘容量/CPU/内存", "type": "text"},
    ]
    label.schema.save(update_fields=["fields_config"])
    record = TemporalRecord.objects.get(entity=label.entity)
    record.data_payload = {
        "asset_no": "2",
        "department": "金华书城",
        "model": "联想扬天T4900C-00",
        "spec": "G32620 @3.3GHZ 500GB 4GB 超长规格说明避免压到条码",
    }
    record.save(update_fields=["data_payload"])

    response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg", "template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 200
    svg = response.content.decode("utf-8")
    assert 'data-text-kind="display-code"' in svg
    assert 'data-text-kind="field"' in svg
    assert 'x="24" y="87" width="208"' in svg
    assert 'x="24" y="119" width="312"' in svg
    assert "...</text></svg>" in svg
    assert '<text x="24" y="104"' not in svg
    assert "扫码查看生命周期" in svg


@pytest.mark.django_db
def test_label_print_uses_stored_template_when_template_is_omitted(client, users, label):
    label.template_code = "small"
    label.save(update_fields=["template_code", "updated_at"])

    response = auth(client, users["editor"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg"},
        format="json",
    )

    assert response.status_code == 200
    assert 'data-template="small"' in response.content.decode("utf-8")


@pytest.mark.django_db
def test_viewer_cannot_print_label(client, users, label):
    response = auth(client, users["viewer"]).post(
        f"/api/v1/labels/{label.id}/print/",
        {"format": "svg", "template_code": "asset_standard"},
        format="json",
    )

    assert response.status_code == 403
    label.refresh_from_db()
    assert label.printed_at is None


@pytest.mark.django_db
def test_editor_can_print_a4_label_sheet_and_audit_each_label(client, users, label):
    another = create_label_for_entity(
        label.schema,
        users["owner"],
        "CT-L-ABCD-EFGH-JKLM-NPQR",
        "ASSET-002",
        "三号库",
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{label.schema_id}/labels/a4-print/",
        {"format": "svg", "template_code": "a4_grid", "label_ids": [label.id, another.id]},
        format="json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("image/svg+xml")
    assert response["Content-Disposition"] == 'inline; filename="labels-a4.svg"'
    assert b"<svg" in response.content
    assert b"CT-L-K7F3-9X2M-Q6V8-T4ND" in response.content
    assert b"CT-L-ABCD-EFGH-JKLM-NPQR" in response.content
    svg = response.content.decode("utf-8")
    assert svg.count('data-kind="qr"') == 2
    assert svg.count('data-kind="code128"') == 2
    assert "SCAN</text>" not in svg

    label.refresh_from_db()
    another.refresh_from_db()
    assert label.printed_by == users["editor"]
    assert another.printed_by == users["editor"]
    assert label.template_code == "asset_standard"
    assert another.template_code == "asset_standard"
    assert label.print_snapshot["template_code"] == "a4_grid"
    assert another.print_snapshot["display_code"] == "ASSET-002"
    assert "serial_no" not in str(label.print_snapshot)
    assert AuditLog.objects.filter(action="label.print", target_id=label.id).exists()
    assert AuditLog.objects.filter(action="label.print", target_id=another.id).exists()


@pytest.mark.django_db
def test_editor_can_preview_a4_label_sheet_without_print_side_effects(client, users, label):
    another = create_label_for_entity(
        label.schema,
        users["owner"],
        "CT-L-ABCD-EFGH-JKLM-NPQR",
        "ASSET-002",
        "三号库",
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{label.schema_id}/labels/a4-preview/",
        {"format": "svg", "template_code": "a4_grid", "label_ids": [label.id, another.id]},
        format="json",
    )

    assert response.status_code == 200
    assert response["Content-Type"].startswith("image/svg+xml")
    assert response["Content-Disposition"] == 'inline; filename="labels-a4-preview.svg"'
    svg = response.content.decode("utf-8")
    assert "<svg" in svg
    assert label.label_code in svg
    assert another.label_code in svg
    assert svg.count('data-kind="qr"') == 2
    assert svg.count('data-kind="code128"') == 2

    label.refresh_from_db()
    another.refresh_from_db()
    assert label.printed_at is None
    assert another.printed_at is None
    assert label.print_snapshot == {}
    assert another.print_snapshot == {}
    assert not AuditLog.objects.filter(action="label.print", target_id=label.id).exists()
    assert not AuditLog.objects.filter(action="label.print", target_id=another.id).exists()


@pytest.mark.django_db
def test_viewer_cannot_preview_a4_label_sheet(client, users, label):
    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{label.schema_id}/labels/a4-preview/",
        {"format": "svg", "template_code": "a4_grid", "label_ids": [label.id]},
        format="json",
    )

    assert response.status_code == 403
    label.refresh_from_db()
    assert label.printed_at is None


@pytest.mark.django_db
def test_editor_can_list_schema_active_label_samples(client, users, label):
    newest = create_label_for_entity(
        label.schema,
        users["owner"],
        "CT-L-ABCD-EFGH-JKLM-NPQR",
        "ASSET-002",
        "三号库",
    )
    revoked = create_label_for_entity(
        label.schema,
        users["owner"],
        "CT-L-BCDE-FGHJ-KLMN-PQRS",
        "ASSET-003",
        "档案室",
    )
    revoked.status = EntityLabel.Status.REVOKED
    revoked.save(update_fields=["status"])
    other_schema = DataSchema.objects.create(
        schema_code="other_asset_samples",
        name="其他样本表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=label.schema.fields_config,
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=other_schema,
        version=1,
        fields_config=other_schema.fields_config,
        changelog="初始版本",
        created_by=users["owner"],
    )
    other_label = create_label_for_entity(
        other_schema,
        users["owner"],
        "CT-L-CDEF-GHJK-LMNP-QRST",
        "OTHER-001",
        "外部仓",
    )

    response = auth(client, users["editor"]).get(
        f"/api/v1/schemas/{label.schema_id}/labels/active-samples/"
    )

    assert response.status_code == 200
    payload = response.json()
    ids = [item["id"] for item in payload["results"]]
    assert payload["count"] == 2
    assert set(ids) == {label.id, newest.id}
    assert ids.index(newest.id) < ids.index(label.id)
    assert revoked.id not in ids
    assert other_label.id not in ids


@pytest.mark.django_db
def test_viewer_cannot_list_schema_active_label_samples(client, users, label):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{label.schema_id}/labels/active-samples/"
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_a4_label_sheet_uses_each_label_template_layout(client, users, label):
    small = create_label_for_entity(
        label.schema,
        users["owner"],
        "CT-L-ABCD-EFGH-JKLM-NPQR",
        "ASSET-002",
        "三号库",
        template_code="small",
    )
    document_cover = create_label_for_entity(
        label.schema,
        users["owner"],
        "CT-L-BCDE-FGHJ-KLMN-PQRS",
        "ASSET-003",
        "档案室",
        template_code="document_cover",
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{label.schema_id}/labels/a4-print/",
        {"format": "svg", "template_code": "a4_grid", "label_ids": [label.id, small.id, document_cover.id]},
        format="json",
    )

    assert response.status_code == 200
    svg = response.content.decode("utf-8")
    assert 'data-template="asset_standard"' in svg
    assert 'data-template="small"' in svg
    assert 'data-template="document_cover"' in svg
    assert "固定资产标签" in svg
    assert "小标签" in svg
    assert "档案封面标签" in svg
    assert svg.count('data-kind="qr"') == 3
    assert svg.count('data-kind="code128"') == 3

    small.refresh_from_db()
    document_cover.refresh_from_db()
    assert small.print_snapshot["template_code"] == "a4_grid"
    assert small.print_snapshot["label_template_code"] == "small"
    assert document_cover.print_snapshot["label_template_code"] == "document_cover"


@pytest.mark.django_db
def test_viewer_cannot_print_a4_label_sheet(client, users, label):
    response = auth(client, users["viewer"]).post(
        f"/api/v1/schemas/{label.schema_id}/labels/a4-print/",
        {"format": "svg", "template_code": "a4_grid", "label_ids": [label.id]},
        format="json",
    )

    assert response.status_code == 403
    label.refresh_from_db()
    assert label.printed_at is None


@pytest.mark.django_db
def test_a4_label_sheet_rejects_labels_outside_schema(client, users, label):
    other_schema = DataSchema.objects.create(
        schema_code="other_asset_print_api",
        name="其他打印资产表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=label.schema.fields_config,
        owner=users["owner"],
        visibility=DataSchema.Visibility.SHARED,
        created_by=users["owner"],
    )
    SchemaVersion.objects.create(
        schema=other_schema,
        version=1,
        fields_config=other_schema.fields_config,
        changelog="初始版本",
        created_by=users["owner"],
    )
    other_label = create_label_for_entity(
        other_schema,
        users["owner"],
        "CT-L-BCDE-FGHJ-KLMN-PQRS",
        "OTHER-001",
        "外部仓",
    )

    response = auth(client, users["editor"]).post(
        f"/api/v1/schemas/{label.schema_id}/labels/a4-print/",
        {"format": "svg", "template_code": "a4_grid", "label_ids": [label.id, other_label.id]},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["invalid_label_ids"] == [other_label.id]
