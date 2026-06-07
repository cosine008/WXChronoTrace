from __future__ import annotations

import ast
from decimal import Decimal, InvalidOperation
from typing import Any


class FormulaError(ValueError):
    pass


ALLOWED_RESULT_TYPES = {"number", "text"}


def formula_dependencies(expression: str) -> set[str]:
    tree = _parse(expression)
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}


def validate_formula_expression(expression: str) -> None:
    _validate_node(_parse(expression))


def evaluate_formula(expression: str, payload: dict[str, Any]) -> Any:
    tree = _parse(expression)
    _validate_node(tree)
    try:
        return _eval_node(tree.body, payload)
    except (FormulaError, InvalidOperation, ZeroDivisionError, ValueError, TypeError):
        return None


def _parse(expression: str) -> ast.Expression:
    if not isinstance(expression, str) or not expression.strip():
        raise FormulaError("formula expression must be a non-empty string")
    try:
        return ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise FormulaError("invalid formula expression") from exc


def _validate_node(node: ast.AST) -> None:
    allowed = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Name,
        ast.Constant,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.USub,
        ast.UAdd,
        ast.Load,
    )
    for child in ast.walk(node):
        if not isinstance(child, allowed):
            raise FormulaError(f"unsupported formula node: {type(child).__name__}")
        if isinstance(child, ast.Constant) and not isinstance(child.value, int | float | str):
            raise FormulaError("unsupported formula literal")


def _eval_node(node: ast.AST, payload: dict[str, Any]) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return payload.get(node.id)
    if isinstance(node, ast.UnaryOp):
        value = _number(_eval_node(node.operand, payload))
        if isinstance(node.op, ast.USub):
            return -value
        return value
    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left, payload)
        right = _eval_node(node.right, payload)
        if isinstance(node.op, ast.Add):
            if isinstance(left, str) or isinstance(right, str):
                return f"{'' if left is None else left}{'' if right is None else right}"
            return _number(left) + _number(right)
        if isinstance(node.op, ast.Sub):
            return _number(left) - _number(right)
        if isinstance(node.op, ast.Mult):
            return _number(left) * _number(right)
        if isinstance(node.op, ast.Div):
            return _number(left) / _number(right)
    raise FormulaError("unsupported formula expression")


def _number(value: Any) -> Decimal:
    if value is None or isinstance(value, bool):
        raise FormulaError("formula value is not numeric")
    return Decimal(str(value))
