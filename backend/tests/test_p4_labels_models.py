import re

import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction

from apps.labels.codegen import LABEL_CODE_ALPHABET, generate_label_code, normalize_label_code
from apps.labels.models import EntityLabel, LabelScanEvent
from apps.schemas.models import DataSchema
from apps.temporal.models import Entity

LABEL_CODE = "CT-L-K7F3-9X2M-Q6V8-T4ND"
LABEL_RE = re.compile(r"^CT-L-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$")


@pytest.fixture
def owner(db):
    return User.objects.create_user(username="owner", password="pass")


@pytest.fixture
def schema(owner):
    return DataSchema.objects.create(
        schema_code="asset_labels",
        name="资产标签表",
        icon="box",
        temporal_mode=DataSchema.TemporalMode.CONTINUOUS,
        identity_field_key="asset_no",
        fields_config=[
            {"key": "asset_no", "label": "资产编号", "type": "text", "required": True},
            {"key": "asset_name", "label": "资产名称", "type": "text"},
        ],
        owner=owner,
        visibility=DataSchema.Visibility.SHARED,
        created_by=owner,
    )


@pytest.fixture
def entity(schema, owner):
    return Entity.objects.create(schema=schema, business_code="ASSET-001", created_by=owner)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (LABEL_CODE, LABEL_CODE),
        ("  ct-l-k7f3-9x2m-q6v8-t4nd  ", LABEL_CODE),
        ("CT-L-K7F3\n9X2M\tQ6V8 T4ND", LABEL_CODE),
        (f"/scan/{LABEL_CODE}", LABEL_CODE),
        (f"https://chronotrace.example.com/scan/{LABEL_CODE}", LABEL_CODE),
    ],
)
def test_normalize_label_code_accepts_code_and_scan_urls(raw, expected):
    assert normalize_label_code(raw) == expected


@pytest.mark.parametrize("raw", ["entity_id=17", "A-001", "CT-L-123"])
def test_normalize_label_code_rejects_non_label_inputs(raw):
    with pytest.raises(ValueError, match="无效标签码"):
        normalize_label_code(raw)


def test_generate_label_code_uses_mvp_format_and_alphabet():
    generated = generate_label_code()
    assert LABEL_RE.match(generated)
    random_part = generated.removeprefix("CT-L-").replace("-", "")
    assert len(random_part) == 16
    assert set(random_part) <= set(LABEL_CODE_ALPHABET)


def test_generate_label_code_has_no_duplicates_in_small_batch():
    generated = {generate_label_code() for _ in range(500)}
    assert len(generated) == 500


@pytest.mark.django_db
def test_label_code_is_globally_unique(entity, owner):
    EntityLabel.objects.create(
        label_code=LABEL_CODE,
        entity=entity,
        schema=entity.schema,
        issued_by=owner,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            EntityLabel.objects.create(
                label_code=LABEL_CODE,
                entity=entity,
                schema=entity.schema,
                issued_by=owner,
            )


@pytest.mark.django_db
def test_entity_can_have_only_one_active_label(entity, owner):
    EntityLabel.objects.create(
        label_code=LABEL_CODE,
        entity=entity,
        schema=entity.schema,
        issued_by=owner,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            EntityLabel.objects.create(
                label_code="CT-L-ABCD-EFGH-JKLM-NPQR",
                entity=entity,
                schema=entity.schema,
                issued_by=owner,
            )


@pytest.mark.django_db
def test_entity_can_keep_multiple_historical_labels(entity, owner):
    for label_code, status in [
        ("CT-L-ABCD-EFGH-JKLM-NPQR", EntityLabel.Status.REVOKED),
        ("CT-L-BCDE-FGHJ-KLMN-PQRS", EntityLabel.Status.REPLACED),
        ("CT-L-CDEF-GHJK-LMNP-QRST", EntityLabel.Status.LOST),
    ]:
        EntityLabel.objects.create(
            label_code=label_code,
            entity=entity,
            schema=entity.schema,
            status=status,
            issued_by=owner,
        )

    assert EntityLabel.objects.filter(entity=entity).count() == 3


@pytest.mark.django_db
def test_scan_event_allows_anonymous_invalid_attempt():
    event = LabelScanEvent.objects.create(
        label=None,
        actor=None,
        label_code_hash="sha256:test",
        outcome=LabelScanEvent.Outcome.INVALID,
        source=LabelScanEvent.Source.API,
        raw_input_kind=LabelScanEvent.RawInputKind.UNKNOWN,
    )

    assert event.actor_id is None
    assert event.label_id is None
