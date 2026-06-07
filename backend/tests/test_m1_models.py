import datetime as dt

import pytest
from django.apps import apps
from django.contrib import admin
from django.contrib.auth.models import User
from django.db import DatabaseError, IntegrityError, transaction

MODEL_SPECS = [
    ("schemas", "DataSchema"),
    ("schemas", "SchemaVersion"),
    ("schemas", "TableCollaborator"),
    ("changesets", "ChangeSet"),
    ("changesets", "ChangeEntry"),
    ("temporal", "Entity"),
    ("temporal", "TemporalRecord"),
    ("audit", "AuditLog"),
]


def model(app_label: str, model_name: str):
    return apps.get_model(app_label, model_name)


@pytest.fixture
def user(db):
    return User.objects.create_user(username="owner", password="pass")


@pytest.fixture
def collaborator(db):
    return User.objects.create_user(username="editor", password="pass")


@pytest.fixture
def schema(user):
    data_schema_model = model("schemas", "DataSchema")
    return data_schema_model.objects.create(
        schema_code="asset_list",
        name="固定资产表",
        description="内部资产台账",
        icon="box",
        temporal_mode="continuous",
        identity_field_key="asset_no",
        fields_config=[
            {
                "key": "asset_no",
                "label": "资产编号",
                "type": "text",
                "required": True,
                "indexed": True,
                "validators": {"max_length": 32},
                "introduced_in_version": 1,
            }
        ],
        owner=user,
        visibility="shared",
        created_by=user,
    )


@pytest.mark.django_db
def test_m1_models_are_installed_and_registered_in_admin():
    for app_label, model_name in MODEL_SPECS:
        cls = model(app_label, model_name)
        assert cls in admin.site._registry


@pytest.mark.django_db
def test_core_m1_relationship_graph_can_be_created(schema, user, collaborator):
    schema_version_model = model("schemas", "SchemaVersion")
    collaborator_model = model("schemas", "TableCollaborator")
    change_set_model = model("changesets", "ChangeSet")
    change_entry_model = model("changesets", "ChangeEntry")
    entity_model = model("temporal", "Entity")
    temporal_record_model = model("temporal", "TemporalRecord")
    audit_log_model = model("audit", "AuditLog")

    schema_version = schema_version_model.objects.create(
        schema=schema,
        version=1,
        fields_config=schema.fields_config,
        changelog="初始版本",
        created_by=user,
    )
    table_collaborator = collaborator_model.objects.create(
        schema=schema,
        user=collaborator,
        role="editor",
        added_by=user,
    )
    change_set = change_set_model.objects.create(
        schema=schema,
        summary="初始化资产",
        status="draft",
        created_by=user,
    )
    entity = entity_model.objects.create(
        schema=schema,
        business_code="ASSET-001",
        created_by=user,
    )
    record = temporal_record_model.objects.create(
        entity=entity,
        schema_version=schema_version.version,
        data_payload={"asset_no": "ASSET-001"},
        valid_from=dt.date(2026, 1, 1),
        change_set=change_set,
        recorded_by=user,
    )
    entry = change_entry_model.objects.create(
        change_set=change_set,
        entity=entity,
        action="create",
        data_after={"asset_no": "ASSET-001"},
        valid_from=dt.date(2026, 1, 1),
        new_record=record,
    )
    audit_log = audit_log_model.objects.create(
        actor=user,
        action="schema.create",
        target_type="schema",
        target_id=schema.id,
        detail={"schema_code": schema.schema_code},
    )

    assert str(schema) == "固定资产表"
    assert str(schema_version) == "asset_list v1"
    assert str(table_collaborator) == "editor -> asset_list"
    assert str(change_set) == f"CS#{change_set.pk} draft"
    assert str(entity) == "asset_list:ASSET-001"
    assert str(record) == "ASSET-001 [2026-01-01, ∞)"
    assert str(entry) == "create ASSET-001"
    assert str(audit_log) == f"schema.create schema#{schema.id}"


@pytest.mark.django_db
def test_schema_business_constraints_reject_invalid_period_and_duplicate_collaborator(
    schema, user, collaborator
):
    data_schema_model = model("schemas", "DataSchema")
    collaborator_model = model("schemas", "TableCollaborator")

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            data_schema_model.objects.create(
                schema_code="bad_periodic",
                name="错误周期表",
                temporal_mode="periodic",
                identity_field_key="code",
                fields_config=[],
                owner=user,
                visibility="private",
                created_by=user,
            )

    collaborator_model.objects.create(
        schema=schema,
        user=collaborator,
        role="viewer",
        added_by=user,
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            collaborator_model.objects.create(
                schema=schema,
                user=collaborator,
                role="editor",
                added_by=user,
            )


@pytest.mark.django_db
def test_temporal_record_constraints_reject_invalid_and_overlapping_ranges(schema, user):
    change_set_model = model("changesets", "ChangeSet")
    entity_model = model("temporal", "Entity")
    temporal_record_model = model("temporal", "TemporalRecord")

    change_set = change_set_model.objects.create(
        schema=schema,
        summary="区间测试",
        status="draft",
        created_by=user,
    )
    entity = entity_model.objects.create(
        schema=schema,
        business_code="ASSET-002",
        created_by=user,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            temporal_record_model.objects.create(
                entity=entity,
                schema_version=1,
                data_payload={"asset_no": "ASSET-002"},
                valid_from=dt.date(2026, 2, 1),
                valid_to=dt.date(2026, 2, 1),
                change_set=change_set,
                recorded_by=user,
            )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            temporal_record_model.objects.create(
                entity=entity,
                schema_version=0,
                data_payload={"asset_no": "ASSET-002"},
                valid_from=dt.date(2025, 1, 1),
                valid_to=dt.date(2025, 3, 1),
                change_set=change_set,
                recorded_by=user,
            )

    temporal_record_model.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={"asset_no": "ASSET-002"},
        valid_from=dt.date(2026, 1, 1),
        valid_to=dt.date(2026, 3, 1),
        change_set=change_set,
        recorded_by=user,
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            temporal_record_model.objects.create(
                entity=entity,
                schema_version=1,
                data_payload={"asset_no": "ASSET-002"},
                valid_from=dt.date(2026, 2, 1),
                valid_to=dt.date(2026, 4, 1),
                change_set=change_set,
                recorded_by=user,
            )


@pytest.mark.django_db
def test_change_entry_payload_constraints_match_action(schema, user):
    change_set_model = model("changesets", "ChangeSet")
    change_entry_model = model("changesets", "ChangeEntry")
    entity_model = model("temporal", "Entity")

    change_set = change_set_model.objects.create(
        schema=schema,
        summary="明细约束测试",
        status="draft",
        created_by=user,
    )
    entity = entity_model.objects.create(
        schema=schema,
        business_code="ASSET-003",
        created_by=user,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            change_entry_model.objects.create(
                change_set=change_set,
                entity=entity,
                action="create",
                data_before={"asset_no": "ASSET-003"},
                data_after={"asset_no": "ASSET-003"},
                valid_from=dt.date(2026, 1, 1),
            )

    change_entry_model.objects.create(
        change_set=change_set,
        entity=entity,
        action="terminate",
        data_before={"asset_no": "ASSET-003"},
        valid_from=dt.date(2026, 6, 1),
    )


@pytest.mark.django_db(transaction=True)
def test_audit_log_is_immutable_after_insert(user):
    audit_log_model = model("audit", "AuditLog")
    audit_log = audit_log_model.objects.create(
        actor=user,
        action="login",
        target_type="user",
        target_id=user.id,
        detail={"username": user.username},
    )

    with pytest.raises(DatabaseError):
        with transaction.atomic():
            audit_log_model.objects.filter(pk=audit_log.pk).update(action="logout")

    with pytest.raises(DatabaseError):
        with transaction.atomic():
            audit_log.delete()
