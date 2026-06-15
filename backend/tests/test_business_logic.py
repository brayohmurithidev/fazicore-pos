"""Unit tests for pure business-logic helpers — no database required."""
from datetime import date

import pytest

from app.services.order import _generate_order_number
from app.services.mpesa import DarajaClient
from app.services.etims import _tax_cat


# ── Order number generation ──────────────────────────────────────────────────

def test_order_number_format():
    num = _generate_order_number("acme", date(2025, 1, 15), 1)
    assert num == "ACME-20250115-00001"


def test_order_number_uppercases_prefix():
    num = _generate_order_number("shop", date(2025, 6, 1), 42)
    assert num.startswith("SHOP-")


def test_order_number_truncates_long_prefix():
    num = _generate_order_number("verylongname", date(2025, 1, 1), 1)
    prefix = num.split("-")[0]
    assert len(prefix) == 4
    assert prefix == "VERY"


def test_order_number_pads_sequence():
    num = _generate_order_number("biz", date(2025, 3, 10), 7)
    assert num.endswith("-00007")


def test_order_number_large_sequence():
    num = _generate_order_number("biz", date(2025, 3, 10), 99999)
    assert num.endswith("-99999")


# ── M-Pesa phone normalisation ───────────────────────────────────────────────

@pytest.fixture
def mpesa():
    return DarajaClient(
        consumer_key="ck",
        consumer_secret="cs",
        passkey="pk",
        shortcode="174379",
        environment="sandbox",
    )


def test_normalize_07xx_to_2547xx(mpesa):
    assert mpesa._normalize_phone("0712345678") == "254712345678"


def test_normalize_strips_plus(mpesa):
    assert mpesa._normalize_phone("+254712345678") == "254712345678"


def test_normalize_strips_spaces(mpesa):
    assert mpesa._normalize_phone("0712 345 678") == "254712345678"


def test_normalize_strips_hyphens(mpesa):
    assert mpesa._normalize_phone("0712-345-678") == "254712345678"


def test_normalize_already_254(mpesa):
    assert mpesa._normalize_phone("254712345678") == "254712345678"


def test_normalize_plus_254(mpesa):
    assert mpesa._normalize_phone("+254712345678") == "254712345678"


def test_normalize_9digit_7xx(mpesa):
    # User types bare 9-digit number (UI shows +254 as decorative prefix)
    assert mpesa._normalize_phone("712345678") == "254712345678"


def test_normalize_9digit_1xx(mpesa):
    assert mpesa._normalize_phone("100000000") == "254100000000"


# ── eTIMS tax category mapping ───────────────────────────────────────────────

def test_tax_cat_16_is_B():
    assert _tax_cat(16.0) == "B"


def test_tax_cat_8_is_C():
    assert _tax_cat(8.0) == "C"


def test_tax_cat_0_is_A():
    assert _tax_cat(0.0) == "A"


def test_tax_cat_unknown_defaults_to_B():
    assert _tax_cat(5.0) == "B"


def test_tax_cat_rounds_to_one_decimal():
    assert _tax_cat(16.001) == "B"   # rounds to 16.0 → B
    assert _tax_cat(7.96) == "C"     # rounds to 8.0 → C
