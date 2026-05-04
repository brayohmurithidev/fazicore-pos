"""
Demo data seeder — creates a full working `demo` org with branches,
categories, products, inventory and users so the POS frontend works
out of the box without any manual setup.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import hash_password
from app.models.branch import Branch
from app.models.category import Category
from app.models.inventory import Inventory
from app.models.organization import Organization, OrgStatus
from app.models.product import Product
from app.models.user import User, UserRole

router = APIRouter(prefix="/seed", tags=["seed"])


@router.post("/demo", status_code=status.HTTP_201_CREATED)
async def seed_demo(session: AsyncSession = Depends(get_session)) -> dict:
    existing = await session.scalar(select(Organization).where(Organization.slug == "demo"))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Demo org already exists",
        )

    # ── Org ────────────────────────────────────────────────────────────────────
    org = Organization(
        name="Demo Store",
        slug="demo",
        email="demo@fazilabs.com",
        country="Kenya",
        status=OrgStatus.ACTIVE,
        is_active=True,
    )
    session.add(org)
    await session.flush()

    # ── Branch ─────────────────────────────────────────────────────────────────
    branches_data = [
        dict(name="Westlands Main",  location="Nairobi, Westlands", phone="+254 712 000 001", manager_name="Alice Mwangi"),
        dict(name="Kilimani Branch", location="Nairobi, Kilimani",  phone="+254 712 000 002", manager_name="Brian Otieno"),
        dict(name="Thika Road Mall", location="Nairobi, Kasarani",  phone="+254 712 000 003", manager_name="Carol Njoki"),
        dict(name="Mombasa CBD",     location="Mombasa, CBD",       phone="+254 712 000 004", manager_name="David Kazungu"),
    ]
    branches = []
    for bd in branches_data:
        b = Branch(org_id=org.id, **bd)
        session.add(b)
        branches.append(b)
    await session.flush()

    # ── Categories ─────────────────────────────────────────────────────────────
    cats_data = [
        ("Beverages",       "#3B82F6", 0),
        ("Dairy",           "#8B5CF6", 1),
        ("Snacks",          "#F59E0B", 2),
        ("Grains & Flour",  "#10B981", 3),
        ("Cleaning",        "#EF4444", 4),
        ("Fresh Produce",   "#84CC16", 5),
        ("Spirits & Beer",  "#F97316", 6),
        ("Health & Beauty", "#EC4899", 7),
    ]
    cats: dict[str, Category] = {}
    for name, color, order in cats_data:
        c = Category(org_id=org.id, name=name, color=color, sort_order=order)
        session.add(c)
        cats[name] = c
    await session.flush()

    def cid(name: str) -> int:
        return cats[name].id

    # ── Products ───────────────────────────────────────────────────────────────
    products_raw = [
        ("Tusker Lager 500ml",     "Spirits & Beer",  200,  140,  "TK-500",  "6001068000000", 0,     "bottle", 24,  "2026-12-31"),
        ("Coca-Cola 500ml",        "Beverages",       60,   40,   "CC-500",  "5449000000996", 0.16,  "bottle", 48,  "2026-09-30"),
        ("Brookside Milk 500ml",   "Dairy",           65,   52,   "BK-500",  "6008100000001", 0,     "packet", 30,  "2026-09-30"),
        ("Unga Pembe 2kg",         "Grains & Flour",  190,  150,  "UP-2KG",  "6001234500001", 0,     "bag",    20,  "2026-11-01"),
        ("Pringles Original 134g", "Snacks",          350,  270,  "PR-134",  "0038000845017", 0.16,  "tin",    12,  "2026-07-15"),
        ("Omo Washing Powder 1kg", "Cleaning",        320,  240,  "OM-1KG",  "6001009000002", 0.16,  "pack",   15,  "2028-01-01"),
        ("Tomatoes (loose)",       "Fresh Produce",   10,   6,    "TM-KG",   "",              0,     "100g",   5,   "2026-07-01"),
        ("Sprite 500ml",           "Beverages",       60,   40,   "SP-500",  "5449000011274", 0.16,  "bottle", 48,  "2026-09-30"),
        ("KCC Butter 250g",        "Dairy",           170,  130,  "KCC-250", "6001068000011", 0,     "pack",   12,  "2026-05-15"),
        ("Kenchic Eggs (crate 30)","Dairy",           500,  420,  "EGG-30",  "6001068000022", 0,     "crate",  5,   "2026-05-10"),
        ("Jameson Whiskey 750ml",  "Spirits & Beer",  2800, 2200, "JM-750",  "5011007003101", 0.16,  "bottle", 6,   "2030-01-01"),
        ("Blue Band Margarine 500g","Dairy",          240,  190,  "BB-500",  "6001068000033", 0,     "tub",    15,  "2026-08-01"),
        ("Krest Bitter Lemon",     "Beverages",       75,   52,   "KR-300",  "5449000111234", 0.16,  "bottle", 24,  "2026-10-01"),
        ("White Cap Lager 500ml",  "Spirits & Beer",  200,  140,  "WC-500",  "6001068000044", 0.16,  "bottle", 24,  "2026-12-31"),
        ("Nivea Body Lotion 400ml","Health & Beauty", 480,  350,  "NV-400",  "4005900000011", 0.16,  "bottle", 8,   "2027-06-01"),
        ("Royco Mchuzi Mix 200g",  "Grains & Flour",  85,   60,   "RM-200",  "6001234500016", 0,     "pack",   20,  "2026-12-01"),
        ("Avocado (each)",         "Fresh Produce",   30,   18,   "AV-EA",   "",              0,     "piece",  10,  "2026-07-01"),
        ("Fanta Orange 500ml",     "Beverages",       60,   40,   "FA-500",  "5449000000019", 0.16,  "bottle", 48,  "2026-09-30"),
    ]

    stock_map = {
        "TK-500": 144, "CC-500": 220, "BK-500": 80,  "UP-2KG": 60,
        "PR-134": 35,  "OM-1KG": 28,  "TM-KG":  15,  "SP-500": 180,
        "KCC-250": 22, "EGG-30": 10,  "JM-750": 18,  "BB-500": 40,
        "KR-300": 96,  "WC-500": 7,   "NV-400": 20,  "RM-200": 55,
        "AV-EA":  30,  "FA-500": 165,
    }

    branch_main = branches[0]
    for (name, cat_name, price, cost, sku, barcode, vat, unit, min_stock, exp_str) in products_raw:
        expiry = date.fromisoformat(exp_str)
        p = Product(
            org_id=org.id,
            name=name,
            category_id=cid(cat_name),
            price=price,
            cost=cost,
            sku=sku,
            barcode=barcode or None,
            vat_rate=vat,
            unit=unit,
            min_stock=min_stock,
            expiry_date=expiry,
            track_inventory=True,
        )
        session.add(p)
        await session.flush()

        qty = stock_map.get(sku, 50)
        inv = Inventory(
            product_id=p.id,
            branch_id=branch_main.id,
            quantity=qty,
            low_stock_threshold=min_stock,
        )
        session.add(inv)

    await session.flush()

    # ── Users ──────────────────────────────────────────────────────────────────
    users_data = [
        ("Alice Mwangi",  UserRole.ADMIN,   branches[0].id, "AM", "1234"),
        ("Brian Otieno",  UserRole.MANAGER, branches[1].id, "BO", "2345"),
        ("Carol Njoki",   UserRole.CASHIER, branches[0].id, "CN", "3456"),
        ("David Kazungu", UserRole.CASHIER, branches[0].id, "DK", "4567"),
        ("Eve Kamau",     UserRole.STOCK,   branches[0].id, "EK", "5678"),
    ]
    for uname, role, branch_id, avatar, pin in users_data:
        u = User(
            org_id=org.id,
            name=uname,
            role=role,
            branch_id=branch_id,
            avatar=avatar,
            pin_hash=hash_password(pin),
        )
        session.add(u)

    await session.flush()

    return {
        "message": "Demo org seeded",
        "org_slug": "demo",
        "users": [
            {"name": n, "pin": p}
            for n, _, _, _, p in users_data
        ],
    }
