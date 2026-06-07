import datetime as dt

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, TableCollaborator
from apps.temporal.models import Entity, TemporalRecord


@pytest.fixture
def users(db):
    return {
        "owner": User.objects.create_user(username="owner", password="pass"),
        "viewer": User.objects.create_user(username="viewer", password="pass"),
    }


@pytest.fixture
def client():
    return APIClient()


def auth(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def formula_schema(users):
    schema = DataSchema.objects.create(
        schema_code="purchase_lines",
        name="Purchase Lines",
        temporal_mode="continuous",
        identity_field_key="line_no",
        fields_config=[
            {"key": "line_no", "label": "Line No", "type": "text", "required": True},
            {"key": "quantity", "label": "Quantity", "type": "number"},
            {"key": "unit_price", "label": "Unit Price", "type": "number"},
            {
                "key": "internal_cost",
                "label": "Internal Cost",
                "type": "number",
                "sensitive": True,
                "masking": {"mode": "full", "visible_roles": ["owner"]},
            },
            {
                "key": "total_price",
                "label": "Total Price",
                "type": "formula",
                "validators": {"expression": "quantity * unit_price", "result_type": "number"},
            },
            {
                "key": "margin",
                "label": "Margin",
                "type": "formula",
                "validators": {"expression": "quantity * unit_price - internal_cost", "result_type": "number"},
            },
        ],
        owner=users["owner"],
        visibility="shared",
        created_by=users["owner"],
    )
    TableCollaborator.objects.create(
        schema=schema,
        user=users["viewer"],
        role="viewer",
        added_by=users["owner"],
    )
    return schema


@pytest.fixture
def formula_record(formula_schema, users):
    change_set = ChangeSet.objects.create(
        schema=formula_schema,
        summary="seed",
        status=ChangeSet.Status.APPLIED,
        created_by=users["owner"],
        applied_at=timezone.now(),
    )
    entity = Entity.objects.create(schema=formula_schema, business_code="L-001", created_by=users["owner"])
    record = TemporalRecord.objects.create(
        entity=entity,
        schema_version=1,
        data_payload={
            "line_no": "L-001",
            "quantity": 3,
            "unit_price": 19.5,
            "internal_cost": 20,
        },
        valid_from=dt.date(2024, 1, 1),
        change_set=change_set,
        recorded_by=users["owner"],
    )
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action=ChangeEntry.Action.CREATE,
        data_after=record.data_payload,
        valid_from=record.valid_from,
        new_record=record,
    )
    return {"change_set": change_set, "entity": entity, "record": record}


@pytest.mark.django_db
def test_formula_field_is_computed_in_current_view_and_not_persisted(
    formula_schema,
    formula_record,
    users,
    client,
):
    response = auth(client, users["owner"]).get(
        f"/api/v1/schemas/{formula_schema.id}/records/?at=2024-01-02"
    )

    assert response.status_code == 200
    payload = response.json()["results"][0]["data_payload"]
    assert payload["total_price"] == 58.5
    assert payload["margin"] == 38.5
    formula_record["record"].refresh_from_db()
    assert "total_price" not in formula_record["record"].data_payload
    assert "margin" not in formula_record["record"].data_payload


@pytest.mark.django_db
def test_formula_depending_on_masked_field_is_masked_for_viewer(
    formula_schema,
    formula_record,
    users,
    client,
):
    response = auth(client, users["viewer"]).get(
        f"/api/v1/schemas/{formula_schema.id}/records/?at=2024-01-02"
    )

    assert response.status_code == 200
    payload = response.json()["results"][0]["data_payload"]
    assert payload["total_price"] == 58.5
    assert payload["internal_cost"] == {"kind": "masked", "display": "***"}
    assert payload["margin"] == {"kind": "masked", "display": "***"}


@pytest.mark.django_db
def test_formula_is_computed_in_changeset_detail(formula_schema, formula_record, users, client):
    response = auth(client, users["owner"]).get(
        f"/api/v1/schemas/{formula_schema.id}/changesets/{formula_record['change_set'].id}/"
    )

    assert response.status_code == 200
    entry = response.json()["entries"][0]
    assert entry["data_after"]["total_price"] == 58.5


@pytest.mark.django_db
def test_formula_field_cannot_be_edited_through_cell_api(
    formula_schema,
    formula_record,
    users,
    client,
):
    response = auth(client, users["owner"]).post(
        f"/api/v1/schemas/{formula_schema.id}/records/{formula_record['entity'].id}/cell/",
        {"field_key": "total_price", "value": 99, "at": "2024-01-02"},
        format="json",
    )

    assert response.status_code == 400
    assert "formula_readonly" in str(response.json())
